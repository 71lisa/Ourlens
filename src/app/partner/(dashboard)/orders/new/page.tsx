import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { CreateEventForm } from "@/features/events/create-event-form";
import { createPartnerOrderFormAction } from "@/features/partners/order-actions";
import { getActivePackages } from "@/server/packages/catalog";
import { prisma } from "@/server/db/prisma";
import { calculatePartnerPrice } from "@/server/partners/pricing";

const errors: Record<string, string> = {
  invalid: "Periksa kembali nama klien dan detail acara.",
  refresh: "Formulir ini kedaluwarsa. Muat ulang halaman lalu coba lagi.",
  schedule: "Jadwal acara tidak valid. Pastikan tanggal dan waktu selesai setelah waktu mulai.",
  used: "Permintaan ini sudah digunakan. Muat ulang halaman untuk membuat pesanan baru.",
  unavailable: "Paket atau akses mitra sudah tidak tersedia.",
  create: "Pesanan tidak dapat dibuat saat ini. Silakan coba lagi.",
};

export default async function NewPartnerOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fpartner%2Forders%2Fnew");
  const account = await prisma.partnerAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    select: { id: true, paidOrderCount: true },
  });
  if (!account) redirect("/partner");

  const now = new Date();
  const [packages, params, tiers, agreement] = await Promise.all([
    getActivePackages(),
    searchParams,
    prisma.partnerDiscountTier.findMany({
      where: { active: true },
      orderBy: { minPaidOrders: "asc" },
      select: { minPaidOrders: true, discountPercent: true },
    }),
    prisma.partnerPriceAgreement.findFirst({
      where: {
        partnerAccountId: account.id,
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: "desc" },
      include: { prices: true },
    }),
  ]);
  const partnerPrices = Object.fromEntries(
    packages.map((item) => {
      const basePrice = Number(item.price);
      if (!item.priceConfigured || item.currency !== "IDR" || !Number.isSafeInteger(basePrice) || basePrice <= 0) {
        return [item.id, {
          price: item.price,
          basePrice: item.price,
          discountPercent: 0,
          customPriceApplied: false,
        }];
      }
      const pricing = calculatePartnerPrice({
        basePrice,
        paidOrderCount: account.paidOrderCount,
        tiers,
        customPrice: agreement?.prices.find((price) => price.packageId === item.id)?.price.toNumber(),
      });
      return [item.id, {
        price: String(pricing.finalPrice),
        basePrice: String(pricing.basePrice),
        discountPercent: pricing.discountPercent,
        customPriceApplied: pricing.customPriceApplied,
      }];
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Koleksi baru dimulai"
        title="Buat acara Anda."
        description="Kumpulkan semua perspektif tamu di satu tempat. Tambahkan detailnya sekarang; ruang acara pribadi dan tautan tamu dibuat bersama."
      />
      {params.error && errors[params.error] ? (
        <p role="alert" className="rounded-md bg-rose/30 p-4 text-sm text-burgundy">
          {errors[params.error]}
        </p>
      ) : null}
      {!packages.length ? (
        <p className="rounded-md border border-charcoal/10 p-4 text-sm">
          Belum ada paket aktif untuk dipesan.
        </p>
      ) : (
        <>
          <p className="rounded-md bg-cream-deep/60 p-4 text-sm text-charcoal/70">
            Pesanan ini dibuat untuk klien dan akan memakai harga khusus mitra atau tingkat diskon yang sudah dicapai.
          </p>
          <CreateEventForm
            packages={packages}
            idempotencyKey={randomUUID()}
            mode="partner"
            action={createPartnerOrderFormAction}
            partnerPrices={partnerPrices}
          />
        </>
      )}
    </div>
  );
}
