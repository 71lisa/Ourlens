import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";
import { getPartnerDiscountTier } from "@/server/partners/pricing";

export default async function PartnerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fpartner");

  const account = await prisma.partnerAccount.findUnique({ where: { userId: session.user.id } });
  if (!account) {
    if (session.user.role === "ORGANIZER") redirect("/partner/apply");
    return <p className="rounded-md border border-charcoal/10 p-5">Akun mitra tidak tersedia. Hubungi admin OurLens jika pengajuan Anda sudah disetujui.</p>;
  }
  if (account.status === "PENDING") redirect("/partner/apply");
  if (account.status === "SUSPENDED") {
    return <p className="rounded-md border border-charcoal/10 p-5">Akses mitra sedang ditangguhkan. Hubungi admin OurLens untuk informasi lebih lanjut.</p>;
  }

  const [tiers, orderCount, pendingOrders, events] = await Promise.all([
    prisma.partnerDiscountTier.findMany({
      where: { active: true },
      orderBy: { minPaidOrders: "asc" },
      select: { minPaidOrders: true, discountPercent: true },
    }),
    prisma.order.count({ where: { partnerAccountId: account.id, tierCountedAt: { not: null } } }),
    prisma.order.count({ where: { partnerAccountId: account.id, status: "PENDING" } }),
    prisma.event.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        orders: { select: { status: true }, take: 1 },
      },
    }),
  ]);
  const currentTier = getPartnerDiscountTier(account.paidOrderCount, tiers);
  const nextTier = tiers.find((tier) => tier.minPaidOrders > account.paidOrderCount);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Dasbor mitra" title={account.businessName} description="Kelola pesanan klien, pantau transaksi, dan lihat perkembangan diskon mitra Anda." />
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-md border border-charcoal/10 p-5">
          <p className="text-sm text-charcoal/60">Pesanan terverifikasi</p>
          <p className="mt-2 font-display text-3xl">{orderCount}</p>
        </article>
        <article className="rounded-md border border-charcoal/10 p-5">
          <p className="text-sm text-charcoal/60">Tingkat diskon saat ini</p>
          <p className="mt-2 font-display text-3xl">{currentTier?.discountPercent ?? 0}%</p>
          <p className="mt-1 text-xs text-charcoal/55">Berlaku untuk pesanan baru berikutnya.</p>
        </article>
        <article className="rounded-md border border-charcoal/10 p-5">
          <p className="text-sm text-charcoal/60">Pesanan menunggu pembayaran</p>
          <p className="mt-2 font-display text-3xl">{pendingOrders}</p>
        </article>
      </section>
      {nextTier ? (
        <p className="rounded-md bg-beige/70 p-4 text-sm">
          Tingkat berikutnya: diskon {nextTier.discountPercent}% setelah {nextTier.minPaidOrders} pesanan lunas terverifikasi
          {" "}({Math.max(0, nextTier.minPaidOrders - account.paidOrderCount)} pesanan lagi).
        </p>
      ) : (
        <p className="rounded-md bg-beige/70 p-4 text-sm">Anda telah mencapai tier diskon tertinggi yang tersedia.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/partner/orders/new" className={cn(buttonVariants())}>Buat pesanan klien</Link>
        <Link href="/partner/orders" className={cn(buttonVariants({ variant: "outline" }))}>Lihat semua pesanan</Link>
      </div>
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Acara terbaru</h2>
        {events.length ? (
          <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
            {events.map((event) => (
              <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <h3 className="font-medium">{event.name}</h3>
                  <p className="text-xs text-charcoal/55">{event.status === "DRAFT" ? "Draf" : event.status === "LIVE" ? "Berlangsung" : event.status === "EXPIRED" ? "Kedaluwarsa" : "Selesai"} · {event.slug}</p>
                </div>
                {event.orders[0]?.status === "PAID" ? (
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/e/${event.slug}`} className="text-sm text-burgundy hover:underline">Halaman acara</Link>
                    <Link href={`/e/${event.slug}/gallery`} className="text-sm text-burgundy hover:underline">Galeri</Link>
                    <a href={`/api/events/${event.slug}/qr`} className="text-sm text-burgundy hover:underline">Unduh QR</a>
                  </div>
                ) : <span className="text-xs text-charcoal/55">Menunggu pembayaran</span>}
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-charcoal/65">Belum ada acara untuk klien.</p>}
      </section>
    </div>
  );
}
