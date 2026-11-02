"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createCheckoutForOrder } from "@/server/orders/service";
import {
  PaymentConfigurationError,
  PaymentProviderError,
} from "@/services/payments/midtrans";

export type CheckoutActionState = { error?: string };

export async function continueCheckoutAction(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    return { error: "Sign in with the organizer account that owns this order." };
  }
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !orderId) {
    return { error: "This order is invalid. Refresh and try again." };
  }

  let checkoutUrl: string | undefined;
  let orderStatusChanged = false;
  try {
    checkoutUrl = await createCheckoutForOrder(orderId, session.user.id);
  } catch (error) {
    if (error instanceof PaymentConfigurationError) return { error: error.message };
    if (error instanceof PaymentProviderError) return { error: error.message };
    if (error instanceof Error && (
      error.message.includes("Only pending orders") ||
      error.message.includes("no longer pending payment") ||
      error.message.includes("has expired") ||
      error.message.includes("Order was not found") ||
      error.message.includes("already being prepared") ||
      error.message.includes("snapshot is unavailable")
    )) {
      orderStatusChanged = error.message.includes("Only pending orders") ||
        error.message.includes("no longer pending payment") ||
        error.message.includes("has expired");
      if (!orderStatusChanged) return { error: error.message };
    } else {
      console.error("[checkout] Could not create payment checkout.", error);
      return { error: "Checkout could not be started. Please try again." };
    }
  }
  if (orderStatusChanged) redirect(`/dashboard/transactions/${orderId}`);
  if (!checkoutUrl) return { error: "Checkout could not be started. Please try again." };
  redirect(checkoutUrl);
}
