import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { getOrganizerOrders } from "@/server/orders/queries";
import { parsePackageSnapshot } from "@/server/packages/snapshot";

function money(amount: { toNumber(): number }, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(amount.toNumber());
}

function orderStatusLabel(status: string) {
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

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) redirect("/login");
  const orders = await getOrganizerOrders(session.user.id);

  return (
    <div className="space-y-8">
      <PageHeader title="Transaksi" description="Riwayat pesanan, status pembayaran, dan paket Anda." />
      {orders.length ? (
        <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
          {orders.map((order) => {
            const snapshot = parsePackageSnapshot(order.packageSnapshot);
            return (
              <article key={order.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-burgundy">{order.orderNumber}</p>
                  <h2 className="mt-1 font-display text-xl">{order.event?.name ?? "Acara tidak tersedia"}</h2>
                  <p className="mt-1 text-sm text-charcoal/65">
                    {snapshot?.name ?? "Detail paket tidak tersedia"} · {money(order.amount, order.currency)}
                  </p>
                  <p className="mt-1 text-xs capitalize text-charcoal/55">
                    Pesanan: {orderStatusLabel(order.status)} · Pembayaran: {order.payments[0]?.status ? orderStatusLabel(order.payments[0].status) : "belum dimulai"} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(order.createdAt)}
                  </p>
                </div>
                <Link href={`/dashboard/transactions/${order.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
                  Lihat transaksi
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Belum ada transaksi" description="Pesanan yang dibuat untuk acara Anda akan muncul di sini." />
      )}
    </div>
  );
}
