import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { hashGuestToken, readGuestToken } from "@/lib/guest-token";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  validateMediaFile,
  validatePhotoPayload,
  validateVideoPayload,
} from "@/lib/media/file-validation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildStorageKey, isSafeStorageKey } from "@/lib/storage-keys";
import { canAcceptGuestContributions } from "@/server/authorization/policies";
import { prisma } from "@/server/db/prisma";
import { buildMemoryCreateInput } from "@/server/memories/photo-memory";
import { getStorageService } from "@/services/storage";

const CAPTION_MAX_LENGTH = 300;
const MAX_UPLOAD_REQUEST_BYTES = MAX_VIDEO_UPLOAD_BYTES + 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function safeCaption(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized ? normalized.slice(0, CAPTION_MAX_LENGTH) : undefined;
}

function isIdempotencyKey(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Request could not be verified." }, { status: 403 });
  }

  const { slug } = await params;
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
      orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
      package: {
        select: {
          retentionDays: true,
          photoLimit: true,
          videoLimit: true,
          videoDurationLimit: true,
        },
      },
      storageUsage: { select: { id: true } },
    },
  });
  const guestAccessEvent = event ? { ...event, isPaid: event.orders.length > 0 } : null;
  const now = new Date();
  if (!event || !guestAccessEvent || !canAcceptGuestContributions(guestAccessEvent, now)) {
    return NextResponse.json({ error: "This event is not available for contributions." }, { status: 404 });
  }

  const token = readGuestToken(request, slug);
  if (!token) {
    return NextResponse.json({ error: "Start a guest session before uploading." }, { status: 401 });
  }

  const guestSession = await prisma.guestSession.findFirst({
    where: {
      eventId: event.id,
      tokenHash: hashGuestToken(token),
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!guestSession) {
    return NextResponse.json({ error: "Your guest session expired. Reopen this event to continue." }, { status: 401 });
  }

  const uploadLimit = consumeRateLimit(
    `guest-upload:${event.id}:${hashGuestToken(token)}`,
    10,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!uploadLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait before trying again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(uploadLimit.retryAfterMs / 1000)) },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ error: "This upload is larger than the event allows." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Choose a valid media file to upload." }, { status: 400 });
  }

  const kindValue = formData.get("kind");
  if (kindValue !== "photo" && kindValue !== "video") {
    return NextResponse.json({ error: "Choose a valid media type." }, { status: 400 });
  }
  const kind = kindValue;
  const mediaEntry = formData.get(kind);
  if (!(mediaEntry instanceof File)) {
    return NextResponse.json(
      { error: kind === "video" ? "Choose an MP4 or MOV video." : "Choose a photo to upload." },
      { status: 400 },
    );
  }

  const originalEntry = formData.get("original");
  if (
    (originalEntry !== null && !(originalEntry instanceof File)) ||
    (kind === "video" && originalEntry !== null)
  ) {
    return NextResponse.json({ error: "The original media is invalid." }, { status: 400 });
  }
  const original = originalEntry instanceof File ? originalEntry : mediaEntry;
  const maxFileSize = kind === "photo" ? MAX_PHOTO_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES;
  for (const file of original === mediaEntry ? [mediaEntry] : [mediaEntry, original]) {
    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: kind === "photo" ? "Choose a photo smaller than 8 MB." : "Choose a video smaller than 100 MB." },
        { status: 413 },
      );
    }
    const preliminaryValidation = validateMediaFile({
      mimeType: file.type,
      fileSize: file.size,
      kind,
      fileName: file.name,
    });
    if (!preliminaryValidation.ok) {
      return NextResponse.json(
        { error: preliminaryValidation.error ?? "This media is not valid." },
        { status: 400 },
      );
    }
  }

  const idempotencyKey = formData.get("idempotencyKey");
  if (!isIdempotencyKey(idempotencyKey)) {
    return NextResponse.json({ error: "This upload request is invalid. Please try again." }, { status: 400 });
  }
  if (!event.storageUsage) {
    return NextResponse.json({ error: "Storage is not configured for this event." }, { status: 409 });
  }

  const bytes = new Uint8Array(await mediaEntry.arrayBuffer());
  const originalBytes = original === mediaEntry
    ? bytes
    : new Uint8Array(await original.arrayBuffer());
  const photoValidation = kind === "photo"
    ? validatePhotoPayload({
        bytes,
        mimeType: mediaEntry.type,
        fileSize: mediaEntry.size,
        fileName: mediaEntry.name,
      })
    : undefined;
  const originalPhotoValidation = kind === "photo"
    ? validatePhotoPayload({
        bytes: originalBytes,
        mimeType: original.type,
        fileSize: original.size,
        fileName: original.name,
      })
    : undefined;
  const videoValidation = kind === "video"
    ? validateVideoPayload({
        bytes,
        mimeType: mediaEntry.type,
        fileSize: mediaEntry.size,
        maxDurationSeconds: event.package?.videoDurationLimit ?? 0,
        fileName: mediaEntry.name,
      })
    : undefined;

  if (photoValidation && !photoValidation.ok) {
    return NextResponse.json({ error: photoValidation.error }, { status: 400 });
  }
  if (originalPhotoValidation && !originalPhotoValidation.ok) {
    return NextResponse.json(
      { error: `Original media: ${originalPhotoValidation.error}` },
      { status: 400 },
    );
  }
  if (videoValidation && !videoValidation.ok) {
    return NextResponse.json({ error: videoValidation.error }, { status: 400 });
  }

  const challengeId = formData.get("challengeId");
  const challengePromptId = typeof challengeId === "string" && challengeId.length > 0
    ? challengeId
    : null;
  const selectedChallenge = challengePromptId
    ? await prisma.challenge.findFirst({
        where: { id: challengePromptId, eventId: event.id, active: true },
        select: { id: true },
      })
    : null;
  if (challengeId && !selectedChallenge) {
    return NextResponse.json({ error: "This event challenge is no longer available." }, { status: 400 });
  }

  const mediaType = kind === "video" ? "VIDEO" : "PHOTO";
  const storageKind = kind === "video" ? "video" : "photo";
  const assetKey = crypto.randomUUID();
  const originalMimeType = kind === "video"
    ? videoValidation!.mimeType
    : originalPhotoValidation!.mimeType;
  const mediaMimeType = kind === "video"
    ? originalMimeType
    : photoValidation!.mimeType;
  const extensionFor = (mimeType: string) => {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "video/quicktime") return "mov";
    return mimeType.split("/")[1];
  };
  const originalStorageKey = buildStorageKey({
    eventId: event.id,
    mediaId: assetKey,
    kind: storageKind,
    variant: "original",
    suffix: `.${extensionFor(originalMimeType)}`,
  });
  const hasEditedPhoto = kind === "photo" && originalEntry instanceof File;
  const optimizedStorageKey = hasEditedPhoto
    ? buildStorageKey({
        eventId: event.id,
        mediaId: assetKey,
        kind: storageKind,
        variant: "edited",
        suffix: `.${extensionFor(mediaMimeType)}`,
      })
    : undefined;
  if (!isSafeStorageKey(originalStorageKey) || (optimizedStorageKey && !isSafeStorageKey(optimizedStorageKey))) {
    return NextResponse.json({ error: "This media could not be placed in a safe storage location." }, { status: 400 });
  }

  const storedBytes = BigInt(original.size + (optimizedStorageKey ? mediaEntry.size : 0));
  const expiresAt = event.package
    ? new Date(now.getTime() + event.package.retentionDays * 24 * 60 * 60 * 1000)
    : undefined;
  const caption = safeCaption(formData.get("caption"));
  const storageKeys: string[] = [];

  try {
    const storage = getStorageService();
    const result = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${event.id}))::text`,
      );
      const lockedEvent = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR SHARE`,
      );
      if (lockedEvent.length !== 1) throw new Error("UPLOAD_EVENT_CLOSED");
      const currentEvent = await transaction.event.findUnique({
        where: { id: event.id },
        select: {
          privacyMode: true,
          status: true,
          expiresAt: true,
          startsAt: true,
          endsAt: true,
          timeZone: true,
          orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
        },
      });
      const currentGuestAccessEvent = currentEvent
        ? { ...currentEvent, isPaid: currentEvent.orders.length > 0 }
        : null;
      if (!currentGuestAccessEvent || !canAcceptGuestContributions(currentGuestAccessEvent, new Date())) {
        throw new Error("UPLOAD_EVENT_CLOSED");
      }

      const existing = await transaction.mediaAsset.findUnique({
        where: { eventId_idempotencyKey: { eventId: event.id, idempotencyKey } },
        select: { type: true, uploadStatus: true },
      });
      if (existing) {
        if (existing.type !== mediaType) throw new Error("UPLOAD_IDEMPOTENCY_KEY_REUSED");
        if (existing.uploadStatus !== "COMPLETE") throw new Error("UPLOAD_ALREADY_IN_PROGRESS");
        return { duplicate: true };
      }

      const mediaLimit = kind === "photo" ? event.package?.photoLimit : event.package?.videoLimit;
      if (mediaLimit !== null && mediaLimit !== undefined) {
        const mediaCount = await transaction.mediaAsset.count({
          where: { eventId: event.id, type: mediaType },
        });
        if (mediaCount >= mediaLimit) {
          throw new Error(kind === "photo" ? "EVENT_PHOTO_LIMIT_REACHED" : "EVENT_VIDEO_LIMIT_REACHED");
        }
      }

      const usageColumn = Prisma.raw(kind === "photo" ? '"photoBytes"' : '"videoBytes"');
      const reserved = await transaction.$executeRaw(Prisma.sql`
        UPDATE "StorageUsage"
        SET "usedBytes" = "usedBytes" + ${storedBytes},
            ${usageColumn} = ${usageColumn} + ${storedBytes},
            "updatedAt" = NOW()
        WHERE "eventId" = ${event.id}
          AND "quotaBytes" - "usedBytes" >= ${storedBytes}
      `);
      if (reserved !== 1) throw new Error("EVENT_STORAGE_QUOTA_EXCEEDED");

      storageKeys.push(originalStorageKey);
      await storage.putObject({
        key: originalStorageKey,
        body: originalBytes,
        contentType: originalMimeType,
      });
      if (optimizedStorageKey) {
        storageKeys.push(optimizedStorageKey);
        await storage.putObject({
          key: optimizedStorageKey,
          body: bytes,
          contentType: mediaMimeType,
        });
      }

      const finalEvent = await transaction.event.findUnique({
        where: { id: event.id },
        select: {
          privacyMode: true,
          status: true,
          expiresAt: true,
          startsAt: true,
          endsAt: true,
          timeZone: true,
          orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
        },
      });
      const finalGuestAccessEvent = finalEvent
        ? { ...finalEvent, isPaid: finalEvent.orders.length > 0 }
        : null;
      if (!finalGuestAccessEvent || !canAcceptGuestContributions(finalGuestAccessEvent, new Date())) {
        throw new Error("UPLOAD_EVENT_CLOSED");
      }
      const memory = await transaction.memory.create({
        data: buildMemoryCreateInput({
          eventId: event.id,
          guestSessionId: guestSession.id,
          storageKey: originalStorageKey,
          optimizedStorageKey,
          idempotencyKey,
          type: mediaType,
          mimeType: mediaMimeType,
          fileSize: BigInt(original.size),
          caption,
          duration: videoValidation?.durationSeconds,
          expiresAt,
        }),
      });
      if (selectedChallenge) {
        await transaction.challengeSubmission.create({
          data: { challengeId: selectedChallenge.id, memoryId: memory.id },
        });
      }

      return { duplicate: false };
    }, { maxWait: 10_000, timeout: 120_000 });

    return NextResponse.json({ success: true }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    for (const key of storageKeys) {
      try {
        await getStorageService().deleteObject(key);
      } catch (cleanupError) {
        console.error("[guest-upload] Could not remove an uncommitted file.", cleanupError);
      }
    }
    if (error instanceof Error && error.message === "UPLOAD_ALREADY_IN_PROGRESS") {
      return NextResponse.json({ error: "This upload is already being processed. Please wait." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "UPLOAD_EVENT_CLOSED") {
      return NextResponse.json({ error: "This event is no longer accepting contributions." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "UPLOAD_IDEMPOTENCY_KEY_REUSED") {
      return NextResponse.json({ error: "This upload request key has already been used." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "EVENT_STORAGE_QUOTA_EXCEEDED") {
      return NextResponse.json({ error: "This event has reached its storage limit." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "EVENT_PHOTO_LIMIT_REACHED") {
      return NextResponse.json({ error: "This event has reached its photo limit." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "EVENT_VIDEO_LIMIT_REACHED") {
      return NextResponse.json({ error: "This event has reached its video limit." }, { status: 413 });
    }
    console.error("[guest-upload] Media upload failed.", error);
    return NextResponse.json({ error: "We could not save this memory. Please try again." }, { status: 500 });
  }
}
