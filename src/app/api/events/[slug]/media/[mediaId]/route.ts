import { prisma } from "@/server/db/prisma";
import { getStorageService } from "@/services/storage";
import {
  canViewEventGallery,
  isRetainedMediaAvailable,
  PUBLIC_GALLERY_MODERATION_STATUSES,
} from "@/server/authorization/policies";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; mediaId: string }> },
) {
  const { slug, mediaId } = await params;
  const now = new Date();
  const media = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      event: {
        slug,
        orders: { some: { status: "PAID" } },
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
        },
      },
    },
  });
  const guestAccessEvent = media
    ? { ...media.event, isPaid: media.event.orders.length > 0 }
    : null;
  if (!media || !guestAccessEvent || !canViewEventGallery(guestAccessEvent)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await getStorageService().getObject(media.optimizedStorageKey ?? media.originalStorageKey);
    if (!isRetainedMediaAvailable(media.expiresAt, new Date())) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[gallery-media] Stored media could not be read.", error);
    return new Response("Media unavailable", { status: 503 });
  }
}