import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { publicEnv } from "@/lib/env";
import { prisma } from "@/server/db/prisma";
import { parsePackageSnapshot } from "@/server/packages/snapshot";
import { shouldIssueReferralReward } from "@/server/promotions/referral";
import { getPaymentService } from "@/services/payments";
import {
  PaymentConfigurationError,
  PaymentProviderError,
  InvalidPaymentNotificationError,
} from "@/services/payments/midtrans";
import type { VerifiedPaymentNotification } from "@/services/payments/types";

type PaymentState = {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  isPaid: boolean;
};

function paymentState(notification: VerifiedPaymentNotification): PaymentState {
  if (
    notification.transactionStatus === "settlement" ||
    (notification.transactionStatus === "capture" && notification.fraudStatus === "accept") ||
    notification.transactionStatus === "partial_refund" ||
    notification.transactionStatus === "partial_chargeback"
  ) {
    return { orderStatus: "PAID", paymentStatus: "PAID", isPaid: true };
  }
  if (notification.transactionStatus === "expire") {
    return { orderStatus: "EXPIRED", paymentStatus: "EXPIRED", isPaid: false };
  }
  if (notification.transactionStatus === "cancel") {
    return { orderStatus: "CANCELLED", paymentStatus: "CANCELLED", isPaid: false };
  }
  if (notification.transactionStatus === "refund" || notification.transactionStatus === "chargeback") {
    return { orderStatus: "REFUNDED", paymentStatus: "REFUNDED", isPaid: false };
  }
  if (
    notification.transactionStatus === "deny" ||
    notification.transactionStatus === "failure"
  ) {
    return { orderStatus: "FAILED", paymentStatus: "FAILED", isPaid: false };
  }
  return { orderStatus: "PENDING", paymentStatus: "PENDING", isPaid: false };
}

function amountMatches(amount: Prisma.Decimal, providerAmount: string): boolean {
  const parsed = Number(providerAmount);
  return Number.isFinite(parsed) && parsed === amount.toNumber();
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function createCheckoutForOrder(orderId: string, ownerId: string): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: ownerId },
    include: { event: { select: { name: true } } },
  });
  if (!order) throw new Error("Order was not found or does not belong to this organizer.");
  if (order.status !== "PENDING") throw new Error("Only pending orders can be paid.");
  if (order.expiresAt && order.expiresAt <= new Date()) {
    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      await transaction.order.update({ where: { id: order.id }, data: { status: "EXPIRED" } });
      await transaction.payment.updateMany({
        where: { orderId: order.id, provider: "MIDTRANS", status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      await transaction.referralVoucher.updateMany({
        where: { orderId: order.id, status: "RESERVED", expiresAt: { lte: now } },
        data: { status: "EXPIRED", orderId: null },
      });
      await transaction.referralVoucher.updateMany({
        where: { orderId: order.id, status: "RESERVED", expiresAt: { gt: now } },
        data: { status: "AVAILABLE", orderId: null },
      });
    });
    throw new Error("This order has expired.");
  }

  const snapshot = parsePackageSnapshot(order.packageSnapshot);
  if (!snapshot) throw new Error("The order package snapshot is unavailable.");
  const amount = order.amount.toNumber();
  if (order.currency !== "IDR" || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new PaymentConfigurationError("This order does not have a configured positive IDR price.");
  }

  const now = new Date();
  const payment = await prisma.payment.upsert({
    where: { orderId_provider: { orderId: order.id, provider: "MIDTRANS" } },
    create: {
      orderId: order.id,
      provider: "MIDTRANS",
      status: "PENDING",
      amount: order.amount,
    },
    update: {},
  });
  if (payment.checkoutUrl) {
    const paymentService = getPaymentService();
    const confirmed = await paymentService.getTransactionStatus(order.orderNumber);
    await applyMidtransNotification(confirmed);
    const latestOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    if (latestOrder.status !== "PENDING") {
      throw new Error("This order is no longer pending payment.");
    }
    return payment.checkoutUrl;
  }

  const claimed = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      checkoutUrl: null,
      OR: [
        { checkoutRequestedAt: null },
        { checkoutRequestedAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
      ],
    },
    data: { checkoutRequestedAt: now },
  });
  if (claimed.count !== 1) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const latest = await prisma.payment.findUnique({ where: { id: payment.id } });
      if (latest?.checkoutUrl) return latest.checkoutUrl;
      if (!latest?.checkoutRequestedAt) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Checkout is already being prepared. Please try again shortly.");
  }

  try {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { email: true, name: true },
    });
    const checkout = await getPaymentService().createCheckout({
      orderNumber: order.orderNumber,
      amount,
      currency: order.currency,
      packageName: snapshot.name,
      eventName: order.event?.name ?? snapshot.name,
      customerEmail: customer.email,
      customerName: customer.name,
      finishUrl: new URL(
        order.partnerAccountId
          ? `/partner/orders/${order.id}?return=1`
          : `/dashboard/transactions/${order.id}?return=1`,
        publicEnv().NEXT_PUBLIC_APP_URL,
      ).toString(),
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutUrl: checkout.checkoutUrl, checkoutRequestedAt: null },
    });
    return checkout.checkoutUrl;
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutRequestedAt: null },
    });
    throw error;
  }
}

export async function applyMidtransNotification(
  notification: VerifiedPaymentNotification,
): Promise<"updated" | "duplicate" | "ignored"> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const order = await transaction.order.findUnique({
          where: { orderNumber: notification.orderNumber },
          include: { event: true, referralVoucher: true },
        });
        if (!order) throw new InvalidPaymentNotificationError("The payment order was not found.");
        if (!amountMatches(order.amount, notification.amount)) {
          throw new InvalidPaymentNotificationError("The confirmed amount does not match the order.");
        }
        const payment = await transaction.payment.findUnique({
          where: { orderId_provider: { orderId: order.id, provider: "MIDTRANS" } },
        });
        if (!payment || !amountMatches(payment.amount, notification.amount)) {
          throw new InvalidPaymentNotificationError("The payment record does not match the order.");
        }

        const nextState = paymentState(notification);
        if (
          order.status === nextState.orderStatus &&
          payment.status === nextState.paymentStatus &&
          payment.providerRef === notification.transactionId
        ) {
          return "duplicate";
        }
        if (
          (order.status === "PAID" && nextState.orderStatus === "PENDING") ||
          (["FAILED", "CANCELLED", "EXPIRED"].includes(order.status) && nextState.orderStatus === "PENDING")
        ) {
          return "ignored";
        }

        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: nextState.paymentStatus,
            providerRef: notification.transactionId,
          },
        });
        const shouldCountPartnerOrder =
          nextState.isPaid && Boolean(order.partnerAccountId) && !order.tierCountedAt;
        await transaction.order.update({
          where: { id: order.id },
          data: {
            status: nextState.orderStatus,
            ...(shouldCountPartnerOrder ? { tierCountedAt: new Date() } : {}),
          },
        });
        if (shouldCountPartnerOrder && order.partnerAccountId) {
          await transaction.partnerAccount.update({
            where: { id: order.partnerAccountId },
            data: { paidOrderCount: { increment: 1 } },
          });
        }

        if (nextState.isPaid && order.referralVoucher?.status === "RESERVED") {
          await transaction.referralVoucher.updateMany({
            where: {
              id: order.referralVoucher.id,
              orderId: order.id,
              status: "RESERVED",
            },
            data: { status: "USED", usedAt: new Date() },
          });
        } else if (
          !nextState.isPaid &&
          ["FAILED", "CANCELLED", "EXPIRED"].includes(nextState.orderStatus) &&
          order.referralVoucher?.status === "RESERVED"
        ) {
          const now = new Date();
          await transaction.referralVoucher.updateMany({
            where: {
              id: order.referralVoucher.id,
              orderId: order.id,
              status: "RESERVED",
              expiresAt: { lte: now },
            },
            data: { status: "EXPIRED", orderId: null },
          });
          await transaction.referralVoucher.updateMany({
            where: {
              id: order.referralVoucher.id,
              orderId: order.id,
              status: "RESERVED",
              expiresAt: { gt: now },
            },
            data: { status: "AVAILABLE", orderId: null },
          });
        }

        if (nextState.isPaid && !order.partnerAccountId) {
          const promotionSettings = await transaction.promotionSettings.findUnique({
            where: { id: "global" },
            select: { referralActive: true },
          });
          const referral = promotionSettings?.referralActive
            ? await transaction.referral.findUnique({
                where: { referredUserId: order.userId },
                select: { id: true, referrerId: true, status: true },
              })
            : null;
          const previousPaidOrders = referral?.status === "PENDING" && promotionSettings?.referralActive
            ? await transaction.order.count({
                where: {
                  userId: order.userId,
                  partnerAccountId: null,
                  status: "PAID",
                  id: { not: order.id },
                },
              })
            : 1;
          if (referral && shouldIssueReferralReward({
            referralEnabled: promotionSettings?.referralActive === true,
            isOrdinaryBuyer: !order.partnerAccountId,
            referralPending: referral.status === "PENDING",
            hasPreviousPaidOrder: previousPaidOrders > 0,
          })) {
            const claim = await transaction.referral.updateMany({
              where: { id: referral.id, status: "PENDING", rewardOrderId: null },
              data: {
                status: "REWARDED",
                rewardOrderId: order.id,
                rewardedAt: new Date(),
              },
            });
            if (claim.count === 1) {
              const expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 6);
              await transaction.referralVoucher.create({
                data: {
                  ownerId: referral.referrerId,
                  referralId: referral.id,
                  amount: new Prisma.Decimal(20_000),
                  expiresAt,
                },
              });
            }
          }
        }

        if (order.eventId && nextState.isPaid) {
          const snapshot = parsePackageSnapshot(order.packageSnapshot);
          if (!snapshot) throw new Error("The order package snapshot is unavailable.");
          await transaction.event.updateMany({
            where: { id: order.eventId, status: "DRAFT" },
            data: { status: "UPCOMING" },
          });
          await transaction.storageUsage.upsert({
            where: { eventId: order.eventId },
            create: {
              eventId: order.eventId,
              quotaBytes: BigInt(snapshot.storageLimitBytes),
            },
            update: { quotaBytes: BigInt(snapshot.storageLimitBytes) },
          });
        } else if (order.eventId && nextState.orderStatus !== "PENDING") {
          await transaction.event.updateMany({
            where: { id: order.eventId, status: { in: ["UPCOMING", "LIVE"] } },
            data: { status: "DRAFT" },
          });
        }
        return "updated";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new PaymentProviderError("The payment update could not be saved. Please retry the notification.");
}
