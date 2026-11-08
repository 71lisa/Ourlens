import { PageHeader } from "@/components/layout/page-header";
import { CreateEventForm } from "@/features/events/create-event-form";
import { auth } from "@/auth";
import { getActivePackages } from "@/server/packages/catalog";
import { prisma } from "@/server/db/prisma";
import { randomUUID } from "node:crypto";

export default async function CreateEventPage() {
  const session = await auth();
  const [packages, promotionSettings, previousPaidOrder, firstEventReservation, vouchers] = await Promise.all([
    getActivePackages(),
    prisma.promotionSettings.findUnique({
      where: { id: "global" },
      select: { firstEventActive: true, referralActive: true },
    }),
    session?.user.role === "ORGANIZER"
      ? prisma.order.findFirst({
          where: { userId: session.user.id, partnerAccountId: null, status: "PAID" },
          select: { id: true },
        })
      : Promise.resolve(null),
    session?.user.role === "ORGANIZER"
      ? prisma.order.findFirst({
          where: {
            userId: session.user.id,
            partnerAccountId: null,
            status: "PENDING",
            promotionType: "FIRST_EVENT",
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    session?.user.role === "ORGANIZER"
      ? prisma.referralVoucher.findMany({
          where: {
            ownerId: session.user.id,
            status: "AVAILABLE",
            expiresAt: { gt: new Date() },
          },
          orderBy: { expiresAt: "asc" },
          select: { id: true, amount: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);
  const buyerPromotions = session?.user.role === "ORGANIZER"
    ? {
        firstEventActive: promotionSettings?.firstEventActive === true,
        firstEventEligible: !previousPaidOrder && !firstEventReservation,
        reservedOrderId: firstEventReservation?.id,
        referralActive: promotionSettings?.referralActive === true,
        vouchers: vouchers.map((voucher) => ({
          id: voucher.id,
          amount: voucher.amount.toString(),
          expiresAt: voucher.expiresAt.toISOString(),
        })),
      }
    : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Koleksi baru dimulai"
        title="Buat acara Anda."
        description="Kumpulkan semua perspektif tamu di satu tempat. Tambahkan detailnya sekarang; ruang acara pribadi dan tautan tamu dibuat bersama."
      />
      <CreateEventForm
        packages={packages}
        idempotencyKey={randomUUID()}
        buyerPromotions={buyerPromotions}
      />
    </div>
  );
}
