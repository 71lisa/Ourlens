import { NextResponse } from "next/server";
import { applyMidtransNotification } from "@/server/orders/service";
import {
  getPaymentService,
} from "@/services/payments";
import {
  InvalidPaymentNotificationError,
  PaymentConfigurationError,
  PaymentProviderError,
} from "@/services/payments/midtrans";

export async function POST(request: Request) {
  const maxBodyBytes = 16 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return NextResponse.json({ error: "Payment notification is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid payment notification." }, { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).byteLength > maxBodyBytes) {
    return NextResponse.json({ error: "Payment notification is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid payment notification." }, { status: 400 });
  }

  try {
    const notification = await getPaymentService().verifyWebhook(payload);
    const result = await applyMidtransNotification(notification);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    if (error instanceof InvalidPaymentNotificationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentConfigurationError) {
      console.error("[midtrans-webhook] Server payment configuration is incomplete.");
      return NextResponse.json({ error: "Payment notifications are temporarily unavailable." }, { status: 503 });
    }
    if (error instanceof PaymentProviderError) {
      console.error("[midtrans-webhook] Could not confirm payment status with Midtrans.", error.message);
      return NextResponse.json({ error: "Payment status could not be confirmed yet." }, { status: 503 });
    }
    console.error("[midtrans-webhook] Could not apply payment notification.", error);
    return NextResponse.json({ error: "Payment notification could not be processed." }, { status: 503 });
  }
}
