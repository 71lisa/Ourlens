import { createHash, timingSafeEqual } from "node:crypto";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentService,
  VerifiedPaymentNotification,
} from "./types";

type MidtransConfig = {
  serverKey: string;
  appBaseUrl: string;
  apiBaseUrl: string;
};

export class PaymentConfigurationError extends Error {
  constructor(message = "Midtrans server configuration is incomplete.") {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

export class InvalidPaymentNotificationError extends Error {
  constructor(message = "The payment notification is invalid.") {
    super(message);
    this.name = "InvalidPaymentNotificationError";
  }
}

export class PaymentProviderError extends Error {
  constructor(message = "The payment provider is temporarily unavailable.") {
    super(message);
    this.name = "PaymentProviderError";
  }
}

function getConfig(): MidtransConfig {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!serverKey) throw new PaymentConfigurationError();
  const environment = process.env.MIDTRANS_ENVIRONMENT?.trim() || "sandbox";
  if (environment !== "sandbox" && environment !== "production") {
    throw new PaymentConfigurationError("MIDTRANS_ENVIRONMENT must be sandbox or production.");
  }
  const production = environment === "production";
  return {
    serverKey,
    appBaseUrl: production ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com",
    apiBaseUrl: production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com",
  };
}

function authorization(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PaymentProviderError("Midtrans returned an invalid response.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equalAmounts(left: string, right: string): boolean {
  const leftAmount = Number(left);
  const rightAmount = Number(right);
  return Number.isFinite(leftAmount) && Number.isFinite(rightAmount) && leftAmount === rightAmount;
}

export class MidtransPaymentService implements PaymentService {
  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const config = getConfig();
    if (input.currency !== "IDR" || !Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new PaymentConfigurationError("Only configured positive IDR package prices can be checked out.");
    }

    const response = await fetch(`${config.appBaseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorization(config.serverKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: input.orderNumber,
          gross_amount: input.amount,
        },
        item_details: [{
          id: input.orderNumber,
          price: input.amount,
          quantity: 1,
          name: `${input.packageName} — ${input.eventName}`.slice(0, 50),
        }],
        customer_details: {
          first_name: input.customerName?.trim() || input.customerEmail,
          email: input.customerEmail,
        },
        credit_card: { secure: true },
        callbacks: { finish: input.finishUrl },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await readJsonResponse(response);
    if (!response.ok || !isRecord(result)) {
      throw new PaymentProviderError("Midtrans could not create the checkout.");
    }
    const checkoutUrl = result.redirect_url;
    const providerToken = result.token;
    if (typeof checkoutUrl !== "string" || typeof providerToken !== "string") {
      throw new PaymentProviderError("Midtrans returned an incomplete checkout response.");
    }
    let parsedCheckoutUrl: URL;
    try {
      parsedCheckoutUrl = new URL(checkoutUrl);
    } catch {
      throw new PaymentProviderError("Midtrans returned an invalid checkout URL.");
    }
    if (
      parsedCheckoutUrl.protocol !== "https:" ||
      parsedCheckoutUrl.hostname !== "app.midtrans.com" &&
        parsedCheckoutUrl.hostname !== "app.sandbox.midtrans.com"
    ) {
      throw new PaymentProviderError("Midtrans returned an untrusted checkout URL.");
    }
    return { checkoutUrl, providerToken };
  }

  async verifyWebhook(payload: unknown): Promise<VerifiedPaymentNotification> {
    const config = getConfig();
    if (!isRecord(payload)) throw new InvalidPaymentNotificationError();
    const orderNumber = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signature = payload.signature_key;
    if (
      typeof orderNumber !== "string" ||
      typeof statusCode !== "string" ||
      typeof grossAmount !== "string" ||
      typeof signature !== "string" ||
      !/^[a-f0-9]{128}$/i.test(signature)
    ) {
      throw new InvalidPaymentNotificationError();
    }

    const expectedSignature = createHash("sha512")
      .update(`${orderNumber}${statusCode}${grossAmount}${config.serverKey}`)
      .digest();
    const receivedSignature = Buffer.from(signature, "hex");
    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw new InvalidPaymentNotificationError("The payment notification signature is invalid.");
    }

    const confirmed = await this.getTransactionStatus(orderNumber);
    if (!equalAmounts(confirmed.amount, grossAmount)) {
      throw new InvalidPaymentNotificationError("The notification amount does not match the confirmed transaction.");
    }
    return confirmed;
  }

  async getTransactionStatus(orderNumber: string): Promise<VerifiedPaymentNotification> {
    const config = getConfig();
    const response = await fetch(
      `${config.apiBaseUrl}/v2/${encodeURIComponent(orderNumber)}/status`,
      {
        headers: {
          Accept: "application/json",
          Authorization: authorization(config.serverKey),
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = await readJsonResponse(response);
    if (!response.ok || !isRecord(result)) {
      throw new PaymentProviderError("Midtrans could not confirm the transaction status.");
    }
    if (result.order_id !== orderNumber || result.status_code !== "200") {
      throw new InvalidPaymentNotificationError("Midtrans returned a status for a different order.");
    }
    if (
      typeof result.transaction_id !== "string" ||
      typeof result.gross_amount !== "string" ||
      typeof result.transaction_status !== "string"
    ) throw new PaymentProviderError("Midtrans returned an incomplete transaction status.");
    return {
      orderNumber,
      transactionId: result.transaction_id,
      amount: result.gross_amount,
      transactionStatus: result.transaction_status,
      fraudStatus: typeof result.fraud_status === "string" ? result.fraud_status : undefined,
    };
  }
}
