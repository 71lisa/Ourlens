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
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) redirect("/login");
  const orders = await getOrganizerOrders(session.user.id);

  return (
    <div className="space-y-8">
      <PageHeader title="Transactions" description="Your orders, payment status, and package history." />
      {orders.length ? (
        <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
          {orders.map((order) => {
            const snapshot = parsePackageSnapshot(order.packageSnapshot);
            return (
              <article key={order.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-burgundy">{order.orderNumber}</p>
                  <h2 className="mt-1 font-display text-xl">{order.event?.name ?? "Event unavailable"}</h2>
                  <p className="mt-1 text-sm text-charcoal/65">
                    {snapshot?.name ?? "Package details unavailable"} · {money(order.amount, order.currency)}
                  </p>
                  <p className="mt-1 text-xs capitalize text-charcoal/55">
                    Order: {orderStatusLabel(order.status)} · Payment: {order.payments[0]?.status.toLowerCase() ?? "not started"} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(order.createdAt)}
                  </p>
                </div>
                <Link href={`/dashboard/transactions/${order.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
                  View transaction
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No transactions yet" description="Orders created with your events will appear here." />
      )}
    </div>
  );
}
