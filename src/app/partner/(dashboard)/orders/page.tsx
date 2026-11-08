import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";

function money(amount: { toNumber(): number }, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(amount.toNumber());
}

export default async function PartnerOrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fpartner%2Forders");
  const account = await prisma.partnerAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!account) redirect("/partner");

  const orders = await prisma.order.findMany({
    where: { partnerAccountId: account.id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      event: { select: { name: true } },
      payments: {
        where: { provider: "MIDTRANS" },
        select: { status: true },
        take: 1,
      },
    },
  });
  return (
    <div className="space-y-8">
      <PageHeader title="Pesanan klien" description="Pesanan dan pembayaran yang dikelola melalui akun mitra Anda." />
      <Link href="/partner/orders/new" className={cn(buttonVariants())}>Buat pesanan klien</Link>
      {orders.length ? (
        <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
          {orders.map((order) => (
            <article key={order.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-burgundy">{order.orderNumber}</p>
                <h2 className="mt-1 font-display text-xl">{order.event?.name ?? "Acara tidak tersedia"}</h2>
                <p className="mt-1 text-sm text-charcoal/65">{order.clientName ?? "Klien"} · {money(order.amount, order.currency)}</p>
                <p className="mt-1 text-xs capitalize text-charcoal/55">
                  Pesanan {order.status === "PENDING" ? "menunggu pembayaran" : order.status === "PAID" ? "lunas" : order.status === "FAILED" ? "gagal" : order.status === "CANCELLED" ? "dibatalkan" : order.status === "EXPIRED" ? "kedaluwarsa" : "diperbarui"} · Pembayaran {order.payments[0]?.status === "PENDING" ? "menunggu" : order.payments[0]?.status === "PAID" ? "lunas" : order.payments[0]?.status === "FAILED" ? "gagal" : order.payments[0]?.status === "CANCELLED" ? "dibatalkan" : order.payments[0]?.status === "EXPIRED" ? "kedaluwarsa" : "belum dimulai"}
                </p>
              </div>
              <Link href={`/partner/orders/${order.id}`} className={cn(buttonVariants({ variant: "outline" }))}>Detail pesanan</Link>
            </article>
          ))}
        </div>
      ) : <p className="border-y border-charcoal/10 py-8 text-sm text-charcoal/65">Belum ada pesanan untuk klien.</p>}
    </div>
  );
}
