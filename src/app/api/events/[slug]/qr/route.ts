import { auth } from "@/auth";
import { eventGuestPath } from "@/lib/slug";
import { publicEnv } from "@/lib/env";
import { getQrService } from "@/services/qr";
import { prisma } from "@/server/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER", "PARTNER"].includes(session.user.role)) {
    return new Response("Anda tidak memiliki izin.", { status: 401 });
  }

  const { slug } = await params;
  const event = await prisma.event.findFirst({
    where: session.user.role === "ADMIN" ? { slug } : { slug, ownerId: session.user.id },
    select: { slug: true, qrCode: { select: { destinationUrl: true } } },
  });
  if (!event) return new Response("Acara tidak ditemukan.", { status: 404 });

  const destinationUrl = event.qrCode?.destinationUrl ?? new URL(
    eventGuestPath(event.slug),
    publicEnv().NEXT_PUBLIC_APP_URL,
  ).toString();
  const qrCode = await getQrService().generate({ destinationUrl, format: "png" });
  return new Response(new Uint8Array(qrCode), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${event.slug}-qr.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
