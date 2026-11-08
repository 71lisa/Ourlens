import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";
import { getEffectiveGuestEventStatus } from "@/server/authorization/policies";

const eventStatusLabels: Record<string, string> = {
  DRAFT: "Draf",
  UPCOMING: "Akan datang",
  LIVE: "Berlangsung",
  ONGOING: "Berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Diarsipkan",
  EXPIRED: "Kedaluwarsa",
  SCHEDULE_UNAVAILABLE: "Jadwal belum tersedia",
};

const orderStatusLabels: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Berhasil",
  FAILED: "Gagal",
  REFUNDED: "Dikembalikan",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
};

function formatCurrency(value: number, currency = "IDR") {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStorage(bytes: bigint) {
  const value = Number(bytes);
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function formatDate(value: Date | null, timeZone = "UTC") {
  if (!value) return "Jadwal belum diatur";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone,
  }).format(value);
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ORGANIZER") redirect("/login");

  const ownerId = session.user.id;
  const paidOrderWhere = { userId: ownerId, status: "PAID" as const, partnerAccountId: null };
  const [
    eventCount,
    eventStatuses,
    photoCount,
    storage,
    paidOrderCount,
    paidOrderTotal,
    recentEvents,
    recentOrders,
  ] = await Promise.all([
    prisma.event.count({ where: { ownerId } }),
    prisma.event.findMany({
      where: { ownerId },
      select: {
        status: true,
        privacyMode: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        expiresAt: true,
        freeTrial: { select: { id: true } },
      },
    }),
    prisma.mediaAsset.count({
      where: { event: { ownerId }, type: "PHOTO", uploadStatus: "COMPLETE" },
    }),
    prisma.storageUsage.aggregate({
      where: { event: { ownerId } },
      _sum: { usedBytes: true },
    }),
    prisma.order.count({ where: paidOrderWhere }),
    prisma.order.aggregate({ where: paidOrderWhere, _sum: { amount: true } }),
    prisma.event.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        privacyMode: true,
        eventDate: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        expiresAt: true,
        _count: { select: { memories: true } },
        freeTrial: { select: { id: true } },
      },
    }),
    prisma.order.findMany({
      where: { userId: ownerId, partnerAccountId: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        event: { select: { name: true } },
      },
    }),
  ]);

  const activeEventCount = eventStatuses.filter((event) => {
    const status = getEffectiveGuestEventStatus({
      ...event,
      isTrial: Boolean(event.freeTrial),
    });
    return status === "UPCOMING" || status === "ONGOING";
  }).length;

  const stats = [
    { label: "Total acara", value: String(eventCount) },
    { label: "Akan datang / berlangsung", value: String(activeEventCount) },
    { label: "Foto terkumpul", value: photoCount.toLocaleString("id-ID") },
    { label: "Penyimpanan terpakai", value: formatStorage(storage._sum.usedBytes ?? 0n) },
    { label: "Pembayaran berhasil", value: formatCurrency(Number(paidOrderTotal._sum.amount ?? 0)) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="Dasbor penyelenggara"
          title={`Halo${session.user.name ? `, ${session.user.name}` : ""}.`}
          description="Pantau acara, foto, dan transaksi Anda dari satu tempat."
        />
        <Link href="/dashboard/events/create" className={cn(buttonVariants())}>
          Buat acara
        </Link>
      </div>

      <section aria-label="Ringkasan aktivitas">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => (
            <Card key={stat.label} className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-charcoal/55">{stat.label}</p>
              <p className="mt-3 break-words font-display text-2xl text-burgundy">{stat.value}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Aktivitas acara</p>
              <h2 className="mt-1 font-display text-2xl">Acara terbaru</h2>
            </div>
            <Link href="/dashboard/events" className="text-sm text-burgundy hover:underline">
              Lihat semua
            </Link>
          </div>
          {recentEvents.length ? (
            <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
              {recentEvents.map((event) => (
                <article key={event.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/events/${event.id}`}
                      className="block truncate font-medium text-charcoal hover:text-burgundy"
                    >
                      {event.name}
                    </Link>
                    <p className="mt-1 text-sm text-charcoal/60">
                      {formatDate(event.startsAt ?? event.eventDate, event.timeZone ?? "UTC")}
                      <span className="mx-2">·</span>
                      {event._count.memories} kenangan
                      {event.freeTrial ? <span className="text-burgundy"> · Uji coba gratis</span> : null}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-cream-deep px-3 py-1 text-xs text-charcoal/70">
                    {eventStatusLabels[getEffectiveGuestEventStatus({
                      ...event,
                      isTrial: Boolean(event.freeTrial),
                    })] ?? event.status}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Acara pertama Anda dimulai di sini"
              description="Buat acara untuk mendapatkan galeri, tautan tamu, dan kode QR."
            />
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Aktivitas pembayaran</p>
              <h2 className="mt-1 font-display text-2xl">Transaksi terbaru</h2>
            </div>
            <Link href="/dashboard/transactions" className="text-sm text-burgundy hover:underline">
              Lihat semua
            </Link>
          </div>
          {recentOrders.length ? (
            <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
              {recentOrders.map((order) => (
                <article key={order.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/transactions/${order.id}`}
                      className="font-medium text-charcoal hover:text-burgundy"
                    >
                      {order.event?.name ?? order.orderNumber}
                    </Link>
                    <p className="mt-1 text-sm text-charcoal/60">
                      {formatDate(order.createdAt)} · {orderStatusLabels[order.status] ?? "Status lainnya"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-charcoal">
                    {formatCurrency(Number(order.amount), order.currency)}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Belum ada transaksi"
              description="Status pembelian paket dan pembayaran acara akan muncul di sini."
            />
          )}
          <p className="text-xs text-charcoal/55">
            {paidOrderCount} transaksi berhasil tercatat pada akun Anda.
          </p>
        </section>
      </div>
    </div>
  );
}
