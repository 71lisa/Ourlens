import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { CheckoutButton } from "@/features/orders/checkout-button";
import { getOrganizerOrder } from "@/server/orders/queries";
import { parsePackageSnapshot } from "@/server/packages/snapshot";

function money(amount: { toNumber(): number }, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency }).format(amount.toNumber());
}

function statusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
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
  const payment = order.payments[0];
  const expired = Boolean(order.expiresAt && order.expiresAt <= new Date());
  const benefits = snapshot ? [
    `${(Number(snapshot.storageLimitBytes) / 1024 ** 3).toFixed(0)} GB storage`,
    `${snapshot.photoLimit ?? "Flexible"} photos`,
    `${snapshot.videoLimit ?? "Flexible"} videos`,
    `${snapshot.retentionDays} days retention`,
  ] : [];
  const stateMessage: Record<string, string> = {
    FAILED: "The payment was declined or could not be completed. Start a new order if you want to try again.",
    CANCELLED: "This payment was cancelled. The event remains unavailable to guests.",
    EXPIRED: "This payment window expired. The event remains unavailable to guests.",
    REFUNDED: "This order was refunded. The event is no longer active for contributions.",
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={order.orderNumber} title="Order details" description={order.event?.name ?? "Event"} />
      <section className="space-y-4 border-y border-charcoal/10 py-5" aria-label="Order summary">
        <div className="flex justify-between gap-4"><span>Package</span><strong>{snapshot?.name ?? "Unavailable"}</strong></div>
        <div className="flex justify-between gap-4"><span>Event</span><strong>{order.event?.name ?? "Unavailable"}</strong></div>
        <div className="flex justify-between gap-4"><span>Total</span><strong>{money(order.amount, order.currency)}</strong></div>
        <div className="flex justify-between gap-4"><span>Order status</span><strong className="capitalize">{statusLabel(order.status)}</strong></div>
        <div className="flex justify-between gap-4"><span>Payment status</span><strong className="capitalize">{payment?.status.toLowerCase() ?? "not started"}</strong></div>
        <div className="flex justify-between gap-4"><span>Created</span><time dateTime={order.createdAt.toISOString()}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(order.createdAt)}</time></div>
        {payment?.updatedAt ? (
          <div className="flex justify-between gap-4"><span>Last payment update</span><time dateTime={payment.updatedAt.toISOString()}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(payment.updatedAt)}</time></div>
        ) : null}
        {benefits.length ? <ul className="list-inside list-disc text-sm text-charcoal/65">{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul> : null}
      </section>

      {returnedFromProvider ? (
        <p role="status" className="text-sm text-charcoal/70">
          You returned from Midtrans. This page shows the server-verified payment status; the redirect itself does not confirm payment.
        </p>
      ) : null}
      {stateMessage[order.status] ? <p className="text-sm text-burgundy">{stateMessage[order.status]}</p> : null}
      {order.status === "PENDING" && !expired ? (
        <div className="space-y-2">
          <p className="text-sm text-charcoal/65">The event and guest contributions stay inactive until Midtrans confirms payment through its signed notification.</p>
          <CheckoutButton orderId={order.id} />
        </div>
      ) : order.status === "PENDING" && expired ? (
        <p className="text-sm text-burgundy">This order has expired and cannot be paid.</p>
      ) : order.status === "PAID" ? (
        <p role="status" className="text-sm text-charcoal/70">Payment verified. Event access follows its saved schedule.</p>
      ) : null}
    </div>
  );
}
