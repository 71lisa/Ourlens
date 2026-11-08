"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { publicEnv } from "@/lib/env";
import { createCheckoutForOrder } from "@/server/orders/service";
import { prisma } from "@/server/db/prisma";
import {
  PaymentConfigurationError,
  PaymentProviderError,
} from "@/services/payments/midtrans";

export type CheckoutActionState = { error?: string; checkoutUrl?: string };

export async function continueCheckoutAction(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Masuk dengan akun penyelenggara yang memiliki pesanan ini." };
  }
  const activePartner = session.user.role === "PARTNER"
    ? await prisma.partnerAccount.findFirst({
        where: { userId: session.user.id, status: "ACTIVE" },
        select: { id: true },
      })
    : null;
  if (!["ADMIN", "ORGANIZER"].includes(session.user.role) && !activePartner) {
    return { error: "Masuk dengan akun mitra yang memiliki pesanan ini." };
  }
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !orderId) {
    return { error: "Pesanan tidak valid. Muat ulang halaman dan coba lagi." };
  }

  let checkoutUrl: string | undefined;
  let orderStatusChanged = false;
  try {
    checkoutUrl = await createCheckoutForOrder(orderId, session.user.id);
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return { error: "Konfigurasi pembayaran belum siap. Hubungi administrator OurLens." };
    }
    if (error instanceof PaymentProviderError) {
      return { error: "Pembayaran tidak dapat diproses saat ini. Silakan coba lagi." };
    }
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
      if (!orderStatusChanged) {
        return {
          error: error.message.includes("Order was not found")
            ? "Pesanan tidak ditemukan atau bukan milik Anda."
            : error.message.includes("already being prepared")
              ? "Pembayaran sedang disiapkan. Silakan tunggu sebentar lalu coba lagi."
              : "Informasi paket pada pesanan tidak tersedia.",
        };
      }
    } else {
      console.error("[checkout] Could not create payment checkout.", error);
      return { error: "Pembayaran tidak dapat dimulai. Silakan coba lagi." };
    }
  }
  if (orderStatusChanged) {
    redirect(activePartner ? `/partner/orders/${orderId}` : `/dashboard/transactions/${orderId}`);
  }
  if (!checkoutUrl) return { error: "Pembayaran tidak dapat dimulai. Silakan coba lagi." };

  const checkout = new URL(checkoutUrl, publicEnv().NEXT_PUBLIC_APP_URL);
  const configuredOrigin = new URL(publicEnv().NEXT_PUBLIC_APP_URL).origin;
  const isLocalMockCheckout = checkout.pathname === "/api/payments/mock" &&
    checkout.protocol === "http:" &&
    (checkout.origin === configuredOrigin ||
      checkout.hostname === "localhost" ||
      checkout.hostname === "127.0.0.1" ||
      checkout.hostname === "0.0.0.0" ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(checkout.hostname));
  return {
    checkoutUrl: isLocalMockCheckout
      ? `${checkout.pathname}${checkout.search}`
      : checkoutUrl,
  };
}
