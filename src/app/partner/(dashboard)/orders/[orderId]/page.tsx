import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { CheckoutButton } from "@/features/orders/checkout-button";
import { getOrganizerOrder } from "@/server/orders/queries";
import { prisma } from "@/server/db/prisma";
import { parsePackageSnapshot } from "@/server/packages/snapshot";
import {
  getEstimatedPhotoCapacity,
  getPackageGuestCapacity,
  GUEST_PHOTO_LIMIT,
} from "@/lib/photo-quota";
import { getEventStatusLabel, getEventTypeLabel } from "@/lib/event-type";

function money(amount: { toNumber(): number }, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(amount.toNumber());
}

function formatPriceSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.discountPercent === "number") return record;
  return null;
}

export default async function PartnerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ return?: string; created?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fpartner%2Forders");
  const account = await prisma.partnerAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!account) redirect("/partner");

  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const order = await getOrganizerOrder(orderId, session.user.id);
  if (!order || order.partnerAccountId !== account.id) notFound();

  const packageSnapshot = parsePackageSnapshot(order.packageSnapshot);
  const packageGuestCapacity = getPackageGuestCapacity(packageSnapshot);
  const priceSnapshot = formatPriceSnapshot(order.priceSnapshot);
  const payment = order.payments[0];
  const expired = Boolean(order.expiresAt && order.expiresAt <= new Date());
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={order.orderNumber} title="Detail pesanan klien" description={order.event?.name ?? "Acara"} />
      {query.created ? <p role="status" className="rounded-md bg-green-50 p-4 text-sm text-green-900">Pesanan berhasil dibuat. Selesaikan pembayaran untuk mengaktifkan acara.</p> : null}
      {order.event ? (
        <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end">
          <div className="space-y-4">
            <PageHeader
              eyebrow={`${getEventTypeLabel(order.event.eventType)} · ${getEventStatusLabel(order.event.status)}`}
              title={order.event.name}
              description={[
                order.event.startsAt && order.event.timeZone
                  ? new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "long",
                      timeStyle: "short",
                      timeZone: order.event.timeZone,
                    }).format(order.event.startsAt)
                  : order.event.eventDate
                    ? new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "long",
                        timeZone: "UTC",
                      }).format(order.event.eventDate)
                    : null,
                order.event.location,
              ].filter(Boolean).join(" · ")}
            />
            {order.status === "PAID" ? (
              <div className="flex flex-wrap gap-3">
                <a href={`/e/${order.event.slug}`} className="text-sm text-burgundy underline">Buka halaman acara</a>
                <a href={`/e/${order.event.slug}/gallery`} className="text-sm text-burgundy underline">Buka galeri</a>
                <a href={`/api/events/${order.event.slug}/qr`} className="text-sm text-burgundy underline">Unduh QR acara</a>
              </div>
            ) : null}
          </div>
          <div
            className="aspect-[4/3] bg-cream-deep bg-cover bg-center"
            style={order.event.coverImageKey
              ? { backgroundImage: `url("${order.event.coverImageKey.replaceAll('"', "%22")}")` }
              : undefined}
            role="img"
            aria-label={order.event.coverImageKey ? `Sampul acara ${order.event.name}` : "Belum ada foto sampul acara"}
          />
        </section>
      ) : null}
      <section className="space-y-4 border-y border-charcoal/10 py-5" aria-label="Ringkasan pesanan">
        <div className="flex justify-between gap-4"><span>Nama klien</span><strong>{order.clientName ?? "—"}</strong></div>
        <div className="flex justify-between gap-4"><span>Paket</span><strong>{packageSnapshot?.name ?? "Tidak tersedia"}</strong></div>
        {packageSnapshot ? (
          <>
            <div className="flex justify-between gap-4">
              <span>Kapasitas upload tamu</span>
              <strong>{packageGuestCapacity === null ? "Tidak terbatas" : `${packageGuestCapacity} tamu`}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>Kuota foto</span>
              <strong>{GUEST_PHOTO_LIMIT} foto maksimal per tamu</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>Estimasi total foto</span>
              <strong>
                {getEstimatedPhotoCapacity(packageSnapshot) === null
                  ? "Mengikuti jumlah tamu dan kapasitas penyimpanan"
                  : `${getEstimatedPhotoCapacity(packageSnapshot)} foto`}
              </strong>
            </div>
          </>
        ) : null}
        <div className="flex justify-between gap-4"><span>Harga paket</span><strong>{priceSnapshot && typeof priceSnapshot.basePrice === "string" ? money({ toNumber: () => Number(priceSnapshot.basePrice) }, order.currency) : "—"}</strong></div>
        {priceSnapshot && typeof priceSnapshot.customPriceApplied === "boolean" ? (
          <div className="flex justify-between gap-4">
            <span>Harga khusus / diskon bertingkat</span>
            <strong>{priceSnapshot.customPriceApplied ? "Harga khusus admin" : `${String(priceSnapshot.discountPercent)}%`}</strong>
          </div>
        ) : null}
        <div className="flex justify-between gap-4"><span>Total</span><strong>{money(order.amount, order.currency)}</strong></div>
        <div className="flex justify-between gap-4"><span>Status pesanan</span><strong>{order.status === "PENDING" ? "Menunggu pembayaran" : order.status === "PAID" ? "Lunas" : order.status === "FAILED" ? "Gagal" : order.status === "CANCELLED" ? "Dibatalkan" : order.status === "EXPIRED" ? "Kedaluwarsa" : "Dikembalikan"}</strong></div>
        <div className="flex justify-between gap-4"><span>Status pembayaran</span><strong>{payment?.status === "PENDING" ? "Menunggu" : payment?.status === "PAID" ? "Lunas" : payment?.status === "FAILED" ? "Gagal" : payment?.status === "CANCELLED" ? "Dibatalkan" : payment?.status === "EXPIRED" ? "Kedaluwarsa" : "Belum dimulai"}</strong></div>
        <div className="flex justify-between gap-4"><span>Dibuat</span><time dateTime={order.createdAt.toISOString()}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(order.createdAt)}</time></div>
      </section>
      {query.return ? <p role="status" className="text-sm text-charcoal/70">Status pembayaran hanya berubah setelah diverifikasi oleh server melalui Midtrans.</p> : null}
      {order.status === "PENDING" && !expired ? <CheckoutButton orderId={order.id} /> : null}
      {order.status === "PAID" ? (
        <p role="status" className="text-sm text-charcoal/70">Pembayaran terverifikasi dan acara klien sudah aktif.</p>
      ) : null}
      {order.status !== "PENDING" && order.status !== "PAID" ? <p className="text-sm text-burgundy">Pesanan ini tidak dapat dibayar lagi. Status: {order.status === "FAILED" ? "gagal" : order.status === "CANCELLED" ? "dibatalkan" : order.status === "EXPIRED" ? "kedaluwarsa" : "dikembalikan"}.</p> : null}
      {order.status === "PENDING" && expired ? <p className="text-sm text-burgundy">Batas pembayaran sudah berakhir.</p> : null}
    </div>
  );
}
