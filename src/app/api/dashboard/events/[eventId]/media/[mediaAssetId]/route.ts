import { auth } from "@/auth";
import { prisma } from "@/server/db/prisma";
import { getStorageService } from "@/services/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; mediaAssetId: string }> },
) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER", "PARTNER"].includes(session.user.role)) {
    return new Response("Anda tidak memiliki izin.", { status: 401 });
  }

  const { eventId, mediaAssetId } = await params;
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      eventId,
      type: { in: ["PHOTO", "VIDEO"] },
      uploadStatus: "COMPLETE",
      event: session.user.role === "ADMIN"
        ? { id: eventId }
        : { id: eventId, ownerId: session.user.id },
    },
    select: { originalStorageKey: true, optimizedStorageKey: true, mimeType: true },
  });
  if (!asset) return new Response("Media tidak ditemukan.", { status: 404 });

  try {
    const bytes = await getStorageService().getObject(asset.optimizedStorageKey ?? asset.originalStorageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[moderation-preview] Stored photo could not be read.", error);
    return new Response("Media tidak tersedia.", { status: 503 });
  }
}