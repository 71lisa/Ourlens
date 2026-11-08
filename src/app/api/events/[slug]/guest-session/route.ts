import { NextResponse } from "next/server";
import { consumeRateLimit, getRateLimitClientKey } from "@/lib/rate-limit";
import { readGuestToken, shouldUseSecureGuestCookie } from "@/lib/guest-token";
import { prisma } from "@/server/db/prisma";
import { canAcceptGuestContributions } from "@/server/authorization/policies";
import {
  getOrCreateGuestSession,
  GuestSessionCapacityError,
  GuestSessionNameRequiredError,
  type GuestSessionRecord,
} from "@/server/guests/session";
import { prismaGuestSessionStore } from "@/server/guests/prisma-session";
import { hasValidRequestOrigin } from "@/lib/request-origin";
import { parsePackageSnapshot } from "@/server/packages/snapshot";
import {
  getPackageGuestCapacity,
  getRemainingPhotoQuota,
  GUEST_PHOTO_LIMIT,
  hasGuestUploadCapacity,
} from "@/lib/photo-quota";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Permintaan tidak dapat diverifikasi." }, { status: 403 });
  }

  const bodyText = await request.text();
  let displayName: string | undefined;
  if (bodyText) {
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Data nama tidak valid." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Data nama tidak valid." }, { status: 400 });
    }
    const rawDisplayName = (body as { displayName?: unknown }).displayName;
    if (rawDisplayName !== undefined && typeof rawDisplayName !== "string") {
      return NextResponse.json({ error: "Nama harus berupa teks." }, { status: 400 });
    }
    displayName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : undefined;
    if (displayName && displayName.length > 60) {
      return NextResponse.json({ error: "Nama maksimal 60 karakter." }, { status: 400 });
    }
  }

  const { slug } = await params;
  const sessionLimit = consumeRateLimit(
    `guest-session:${slug}:${getRateLimitClientKey(request)}`,
    30,
    60 * 1000,
  );
  if (!sessionLimit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak sesi tamu. Silakan tunggu sebelum mencoba lagi." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(sessionLimit.retryAfterMs / 1000)) },
      },
    );
  }

  const token = readGuestToken(request, slug);
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      privacyMode: true,
      status: true,
      expiresAt: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      orders: { where: { status: "PAID" }, select: { id: true, packageSnapshot: true }, take: 1 },
      freeTrial: { select: { photoLimit: true } },
      package: { select: { name: true, guestCapacity: true, isUnlimited: true } },
    },
  });
  const guestAccessEvent = event
    ? { ...event, isPaid: event.orders.length > 0, isTrial: Boolean(event.freeTrial) }
    : null;
  const now = new Date();
  if (!event || !guestAccessEvent || !canAcceptGuestContributions(guestAccessEvent, now)) {
    return NextResponse.json({ error: "Acara ini tidak tersedia." }, { status: 404 });
  }

  const cookieName = `ourlens_guest_${slug}`;
  const packageSnapshot = parsePackageSnapshot(event.orders[0]?.packageSnapshot);
  const snapshotGuestCapacity = getPackageGuestCapacity(packageSnapshot);
  const guestCapacity = event.freeTrial
    ? null
    : snapshotGuestCapacity === 0
      ? getPackageGuestCapacity(event.package)
      : snapshotGuestCapacity;
  let session: { session: GuestSessionRecord; token: string; reused: boolean };
  try {
    session = await getOrCreateGuestSession({
      eventId: event.id,
      existingToken: token,
      displayName,
      store: prismaGuestSessionStore,
      guestCapacity,
    });
  } catch (error) {
    if (error instanceof GuestSessionNameRequiredError) {
      return NextResponse.json({ ready: false, nameRequired: true });
    }
    if (error instanceof GuestSessionCapacityError) {
      return NextResponse.json(
        { error: "Kapasitas tamu acara sudah penuh. Tautan ini tidak menerima tamu baru." },
        { status: 409 },
      );
    }
    throw error;
  }

  const [guestPhotoCount, eventPhotoCount, participantCount] = await Promise.all([
    prisma.mediaAsset.count({
      where: {
        eventId: event.id,
        type: "PHOTO",
        uploadStatus: "COMPLETE",
        memory: { is: { guestSessionId: session.session.id } },
      },
    }),
    event.freeTrial
      ? prisma.mediaAsset.count({
          where: { eventId: event.id, type: "PHOTO", uploadStatus: "COMPLETE" },
        })
      : Promise.resolve(0),
    event.freeTrial
      ? Promise.resolve(0)
      : prisma.guestSession.count({
          where: {
            eventId: event.id,
            memories: {
              some: {
                mediaAssets: {
                  some: { type: "PHOTO", uploadStatus: "COMPLETE" },
                },
              },
            },
          },
        }),
  ]);
  const trialLimit = event.freeTrial?.photoLimit ?? 10;
  const photoQuota = event.freeTrial
    ? {
        scope: "event" as const,
        uploaded: eventPhotoCount,
        limit: trialLimit,
        remaining: getRemainingPhotoQuota(eventPhotoCount, trialLimit),
        participantCount: null,
        participantLimit: null,
        canUpload: eventPhotoCount < trialLimit,
      }
    : {
        scope: "guest" as const,
        uploaded: guestPhotoCount,
        limit: GUEST_PHOTO_LIMIT,
        remaining: getRemainingPhotoQuota(guestPhotoCount, GUEST_PHOTO_LIMIT),
        participantCount,
        participantLimit: guestCapacity,
        canUpload:
          guestPhotoCount < GUEST_PHOTO_LIMIT &&
          hasGuestUploadCapacity({ participantCount, guestPhotoCount, guestCapacity }),
      };

  const response = NextResponse.json({
    ready: true,
    displayName: session.session.displayName,
    photoQuota,
  });
  if (!session.reused) {
    response.cookies.set(cookieName, session.token, {
      httpOnly: true,
      secure: shouldUseSecureGuestCookie(request),
      sameSite: "strict",
      path: `/api/events/${slug}`,
      expires: session.session.expiresAt,
    });
  }
  return response;
}