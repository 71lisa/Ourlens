import { auth } from "@/auth";
import { hasValidRequestOrigin } from "@/lib/request-origin";
import {
  canManageEvent,
  canViewEventGallery,
  isRetainedMediaAvailable,
  PUBLIC_GALLERY_MODERATION_STATUSES,
} from "@/server/authorization/policies";
import { prisma } from "@/server/db/prisma";
import { getStorageService } from "@/services/storage";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; mediaId: string }> },
) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Permintaan tidak dapat diverifikasi." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Masuk untuk mengelola acara ini." }, { status: 401 });
  }

  const { slug, mediaId } = await params;
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      event: { slug },
      type: { in: ["PHOTO", "VIDEO"] },
      uploadStatus: "COMPLETE",
    },
    select: {
      id: true,
      eventId: true,
      memoryId: true,
      originalStorageKey: true,
      optimizedStorageKey: true,
      thumbnailStorageKey: true,
      event: {
        select: {
          ownerId: true,
          privacyMode: true,
          accessGrants: { select: { userId: true, role: true } },
        },
      },
    },
  });
  if (!asset) {
    return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
  }

  if (session.user.role === "GUEST" || !canManageEvent(
    { id: session.user.id, role: session.user.role },
    {
      ownerId: asset.event.ownerId,
      privacyMode: asset.event.privacyMode,
      grantUserIds: asset.event.accessGrants
        .filter((grant) => grant.role !== "VIEWER")
        .map((grant) => grant.userId),
    },
  )) {
    return NextResponse.json({ error: "Anda tidak dapat mengelola acara ini." }, { status: 403 });
  }

  const storageKeys = [...new Set([
    asset.originalStorageKey,
    asset.optimizedStorageKey,
    asset.thumbnailStorageKey,
  ].filter((key): key is string => Boolean(key)))];

  try {
    await Promise.all(storageKeys.map((key) => getStorageService().deleteObject(key)));
    const deleted = await prisma.$transaction(async (transaction) => {
      const result = await transaction.mediaAsset.deleteMany({
        where: { id: asset.id, eventId: asset.eventId },
      });
      if (result.count === 0) return false;

      if (asset.memoryId) {
        const remainingAssets = await transaction.mediaAsset.count({
          where: { memoryId: asset.memoryId },
        });
        if (remainingAssets === 0) {
          await transaction.memory.deleteMany({ where: { id: asset.memoryId } });
        }
      }
      return true;
    });
    if (!deleted) {
      return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
    }
  } catch (error) {
    console.error("[gallery-media] Media could not be deleted.", error);
    return NextResponse.json(
      { error: "Foto tidak dapat dihapus. Silakan coba lagi." },
      { status: 503 },
    );
  }

  revalidatePath(`/e/${slug}/gallery`);
  revalidatePath(`/e/${slug}`);
  revalidatePath(`/dashboard/events/${asset.eventId}`);
  return NextResponse.json({ success: true });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; mediaId: string }> },
) {
  const { slug, mediaId } = await params;
  const isDownload = new URL(request.url).searchParams.get("download") === "1";
  const now = new Date();
  const media = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      event: {
        slug,
        OR: [
          { orders: { some: { status: "PAID" } } },
          { freeTrial: { isNot: null } },
        ],
        privacyMode: { in: ["PUBLIC_LINK", "MODERATED"] },
        status: { in: ["UPCOMING", "LIVE", "COMPLETED", "EXPIRED"] },
      },
      type: { in: ["PHOTO", "VIDEO"] },
      uploadStatus: "COMPLETE",
      moderationStatus: { in: [...PUBLIC_GALLERY_MODERATION_STATUSES] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      originalStorageKey: true,
      optimizedStorageKey: true,
      mimeType: true,
      type: true,
      expiresAt: true,
      event: {
        select: {
          privacyMode: true,
          status: true,
          expiresAt: true,
          orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
          freeTrial: { select: { id: true } },
        },
      },
    },
  });
  const guestAccessEvent = media
    ? {
        ...media.event,
        isPaid: media.event.orders.length > 0,
        isTrial: Boolean(media.event.freeTrial),
      }
    : null;
  if (!media || !guestAccessEvent || !canViewEventGallery(guestAccessEvent)) {
    return new Response("Media tidak ditemukan.", { status: 404 });
  }

  try {
    const bytes = await getStorageService().getObject(media.optimizedStorageKey ?? media.originalStorageKey);
    if (!isRetainedMediaAvailable(media.expiresAt, new Date())) {
      return new Response("Media tidak ditemukan.", { status: 404 });
    }
    const headers = new Headers({
      "Content-Type": media.mimeType,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (isDownload) {
      const fileId = mediaId.replace(/[^A-Za-z0-9_-]/g, "_");
      const extension = media.mimeType.split("/")[1]?.replace(/[^A-Za-z0-9.+-]/g, "") || "bin";
      headers.set("Content-Disposition", `attachment; filename="ourlens-${fileId}.${extension}"`);
    }
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    console.error("[gallery-media] Stored media could not be read.", error);
    return new Response("Media tidak tersedia.", { status: 503 });
  }
}