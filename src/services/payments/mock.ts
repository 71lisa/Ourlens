import { publicEnv } from "@/lib/env";
import { InvalidPaymentNotificationError, PaymentConfigurationError } from "@/services/payments/midtrans";
import type { CreateCheckoutInput, CreateCheckoutResult, PaymentService, VerifiedPaymentNotification } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class LocalMockPaymentService implements PaymentService {
  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (input.currency !== "IDR" || !Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new PaymentConfigurationError("Only configured positive IDR package prices can be checked out.");
    }

    const checkoutUrl = new URL(
      `/api/payments/mock?orderNumber=${encodeURIComponent(input.orderNumber)}`,
      publicEnv().NEXT_PUBLIC_APP_URL,
    ).toString();

    return { checkoutUrl, providerToken: "local-mock-provider-token" };
  }

  async verifyWebhook(payload: unknown): Promise<VerifiedPaymentNotification> {
    if (!isRecord(payload)) {
      throw new InvalidPaymentNotificationError();
    }

    const orderNumber = typeof payload.order_id === "string" ? payload.order_id : undefined;
    const grossAmount = typeof payload.gross_amount === "string" ? payload.gross_amount : undefined;
    const transactionId = typeof payload.transaction_id === "string" ? payload.transaction_id : `mock-${Date.now()}`;

    if (!orderNumber || !grossAmount) {
      throw new InvalidPaymentNotificationError();
    }

    return {
      orderNumber,
      transactionId,
      amount: grossAmount,
      transactionStatus: "settlement",
      fraudStatus: "accept",
    };
  }

  async getTransactionStatus(orderNumber: string): Promise<VerifiedPaymentNotification> {
    return {
      orderNumber,
      transactionId: `mock-${orderNumber}`,
      amount: "0",
      transactionStatus: "settlement",
      fraudStatus: "accept",
    };
  }
}
