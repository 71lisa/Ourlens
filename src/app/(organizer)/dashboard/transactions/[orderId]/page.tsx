import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { CheckoutButton } from "@/features/orders/checkout-button";
import { getOrganizerOrder } from "@/server/orders/queries";
import { parsePackageSnapshot } from "@/server/packages/snapshot";
import { getEstimatedPhotoCapacity, getPackageGuestCapacity, GUEST_PHOTO_LIMIT } from "@/lib/photo-quota";

function money(amount: { toNumber(): number }, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(amount.toNumber());
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Menunggu pembayaran",
    PAID: "Lunas",
    FAILED: "Gagal",
    CANCELLED: "Dibatalkan",
    EXPIRED: "Kedaluwarsa",
    REFUNDED: "Dana dikembalikan",
  };
  return labels[status] ?? "Status lainnya";
}

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) redirect("/login");
  const { orderId } = await params;
  const { return: returnedFromProvider } = await searchParams;
  const order = await getOrganizerOrder(orderId, session.user.id);
  if (!order) notFound();

  const snapshot = parsePackageSnapshot(order.packageSnapshot);
  const guestCapacity = getPackageGuestCapacity(snapshot);
  const payment = order.payments[0];
  const expired = Boolean(order.expiresAt && order.expiresAt <= new Date());
  const benefits = snapshot ? [
    `${(Number(snapshot.storageLimitBytes) / 1024 ** 3).toFixed(0)} GB penyimpanan`,
    guestCapacity === null ? "Jumlah tamu tidak terbatas" : `Maksimal ${guestCapacity} tamu`,
    `Maksimal ${GUEST_PHOTO_LIMIT} foto per tamu`,
    getEstimatedPhotoCapacity(snapshot) === null
      ? "Jumlah foto mengikuti kapasitas penyimpanan acara"
      : `Perkiraan total ${getEstimatedPhotoCapacity(snapshot)} foto`,
    `${snapshot.videoLimit ?? "Fleksibel"} video`,
    `Masa penyimpanan ${snapshot.retentionDays} hari`,
  ] : [];
  const stateMessage: Record<string, string> = {
    FAILED: "Pembayaran ditolak atau tidak dapat diselesaikan. Buat pesanan baru jika ingin mencoba lagi.",
    CANCELLED: "Pembayaran dibatalkan. Acara tetap tidak tersedia untuk tamu.",
    EXPIRED: "Jendela pembayaran kedaluwarsa. Acara tetap tidak tersedia untuk tamu.",
    REFUNDED: "Pesanan ini telah dikembalikan. Acara tidak lagi aktif untuk kontribusi.",
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={order.orderNumber} title="Detail transaksi" description={order.event?.name ?? "Acara"} />
      <section className="space-y-4 border-y border-charcoal/10 py-5" aria-label="Ringkasan transaksi">
        <div className="flex justify-between gap-4"><span>Paket</span><strong>{snapshot?.name ?? "Tidak tersedia"}</strong></div>
        <div className="flex justify-between gap-4"><span>Acara</span><strong>{order.event?.name ?? "Tidak tersedia"}</strong></div>
        {order.baseAmount && order.discountAmount.greaterThan(0) ? (
          <>
            <div className="flex justify-between gap-4"><span>Harga awal</span><strong>{money(order.baseAmount, order.currency)}</strong></div>
            <div className="flex justify-between gap-4">
              <span>
                Potongan {order.promotionType === "FIRST_EVENT" ? "acara pertama (15%)" : "voucher referral"}
              </span>
              <strong>−{money(order.discountAmount, order.currency)}</strong>
            </div>
          </>
        ) : null}
        <div className="flex justify-between gap-4"><span>Total</span><strong>{money(order.amount, order.currency)}</strong></div>
        <div className="flex justify-between gap-4"><span>Status pesanan</span><strong className="capitalize">{statusLabel(order.status)}</strong></div>
        <div className="flex justify-between gap-4"><span>Status pembayaran</span><strong>{payment?.status === "PENDING" ? "Menunggu" : payment?.status === "PAID" ? "Lunas" : payment?.status === "FAILED" ? "Gagal" : payment?.status === "CANCELLED" ? "Dibatalkan" : payment?.status === "EXPIRED" ? "Kedaluwarsa" : payment?.status === "REFUNDED" ? "Dana dikembalikan" : "Belum dimulai"}</strong></div>
        <div className="flex justify-between gap-4"><span>Dibuat</span><time dateTime={order.createdAt.toISOString()}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(order.createdAt)}</time></div>
        {payment?.updatedAt ? (
          <div className="flex justify-between gap-4"><span>Terakhir diperbarui</span><time dateTime={payment.updatedAt.toISOString()}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(payment.updatedAt)}</time></div>
        ) : null}
        {benefits.length ? <ul className="list-inside list-disc text-sm text-charcoal/65">{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul> : null}
      </section>

      {returnedFromProvider ? (
        <p role="status" className="text-sm text-charcoal/70">
          Anda kembali dari Midtrans. Halaman ini menampilkan status pembayaran yang sudah diverifikasi server; redirect itu sendiri belum berarti pembayaran selesai.
        </p>
      ) : null}
      {stateMessage[order.status] ? <p className="text-sm text-burgundy">{stateMessage[order.status]}</p> : null}
      {order.status === "PENDING" && !expired ? (
        <div className="space-y-2">
          <p className="text-sm text-charcoal/65">Acara dan kontribusi tamu tetap tidak aktif sampai pembayaran dikonfirmasi oleh notifikasi yang diverifikasi server.</p>
          <CheckoutButton orderId={order.id} />
        </div>
      ) : order.status === "PENDING" && expired ? (
        <p className="text-sm text-burgundy">Pesanan ini telah kedaluwarsa dan tidak bisa dibayar.</p>
      ) : order.status === "PAID" ? (
        <p role="status" className="text-sm text-charcoal/70">Pembayaran terverifikasi. Akses acara akan mengikuti jadwal yang sudah disimpan.</p>
      ) : null}
    </div>
  );
}
