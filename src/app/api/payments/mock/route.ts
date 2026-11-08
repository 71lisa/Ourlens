import { NextResponse } from "next/server";
import { getTrustedRequestOrigin } from "@/lib/request-origin";
import { prisma } from "@/server/db/prisma";
import { applyMidtransNotification } from "@/server/orders/service";

function transactionUrl(orderId: string, origin: string): URL {
  return new URL(`/dashboard/transactions/${orderId}?return=1`, origin);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("orderNumber");

  if (!orderNumber) {
    return NextResponse.json({ error: "Nomor pesanan wajib diisi." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      amount: true,
      status: true,
      eventId: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
  }

  const returnOrigin = getTrustedRequestOrigin(request);
  if (order.status !== "PENDING") {
    return NextResponse.redirect(transactionUrl(order.id, returnOrigin));
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId_provider: { orderId: order.id, provider: "MIDTRANS" } },
    select: { amount: true },
  });

  if (!payment) {
    return NextResponse.json({ error: "Data pembayaran tidak ditemukan." }, { status: 404 });
  }

  await applyMidtransNotification({
    orderNumber: order.orderNumber,
    transactionId: `mock-${order.orderNumber}`,
    amount: payment.amount.toString(),
    transactionStatus: "settlement",
    fraudStatus: "accept",
  });

  return NextResponse.redirect(transactionUrl(order.id, returnOrigin));
}
