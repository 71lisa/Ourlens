"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { publicEnv } from "@/lib/env";
import { eventGuestPath, slugifyEventName, uniqueEventSlug } from "@/lib/slug";
import { createEventSchema, getEventSchedule } from "@/features/events/schema";
import { prisma } from "@/server/db/prisma";
import { calculatePartnerPrice } from "@/server/partners/pricing";
import { createPackageSnapshot, isPackagePriceConfigured } from "@/server/packages/snapshot";
import type { CreateEventState } from "@/features/events/actions";

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function invalidOrder(code: string): never {
  redirect(`/partner/orders/new?error=${encodeURIComponent(code)}`);
}

export async function createPartnerOrderAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fpartner%2Forders%2Fnew");

  const partnerAccount = await prisma.partnerAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!partnerAccount) redirect("/partner/apply");

  const parsedEvent = createEventSchema.safeParse({
    name: formData.get("name"),
    organizerName: formData.get("organizerName") || undefined,
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    startTime: formData.get("startTime"),
    endDate: formData.get("endDate"),
    endTime: formData.get("endTime"),
    timeZone: formData.get("timeZone"),
    location: formData.get("location") || undefined,
    description: formData.get("description") || undefined,
    coverImageUrl: formData.get("coverImageUrl") || undefined,
    privacyMode: formData.get("privacyMode") || "PUBLIC_LINK",
    packageId: formData.get("packageId"),
    filter: formData.get("photoFilter") || undefined,
    frame: formData.get("photoFrame") || undefined,
  });
  const clientName = formData.get("clientName");
  if (
    !parsedEvent.success ||
    typeof clientName !== "string" ||
    clientName.trim().length < 2 ||
    clientName.trim().length > 120
  ) {
    invalidOrder("invalid");
  }

  const idempotencyKey = formData.get("idempotencyKey");
  if (
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
  ) {
    invalidOrder("refresh");
  }
  const schedule = getEventSchedule(parsedEvent.data);
  if (!schedule || schedule.endsAt <= schedule.startsAt) invalidOrder("schedule");

  try {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true, partnerAccountId: true },
    });
    if (existing) {
      if (existing.userId !== session.user.id || existing.partnerAccountId !== partnerAccount.id) {
        invalidOrder("used");
      }
      redirect(`/partner/orders/${existing.id}?created=1`);
    }

    let orderId: string | undefined;
    for (let attempt = 0; attempt < 3 && !orderId; attempt += 1) {
      try {
        orderId = await prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))::text`,
          );
          const previousOrder = await transaction.order.findUnique({
            where: { idempotencyKey },
            select: { id: true, userId: true, partnerAccountId: true },
          });
          if (previousOrder) {
            if (
              previousOrder.userId !== session.user.id ||
              previousOrder.partnerAccountId !== partnerAccount.id
            ) {
              throw new Error("Permintaan pesanan ini sudah pernah digunakan.");
            }
            return previousOrder.id;
          }

          const [account, selectedPackage, tiers, agreement] = await Promise.all([
            transaction.partnerAccount.findFirst({
              where: { id: partnerAccount.id, userId: session.user.id, status: "ACTIVE" },
              select: { id: true, paidOrderCount: true },
            }),
            transaction.package.findFirst({
              where: { id: parsedEvent.data.packageId, isActive: true },
            }),
            transaction.partnerDiscountTier.findMany({
              where: { active: true },
              orderBy: { minPaidOrders: "asc" },
              select: { minPaidOrders: true, discountPercent: true },
            }),
            transaction.partnerPriceAgreement.findFirst({
              where: {
                partnerAccountId: partnerAccount.id,
                active: true,
                startsAt: { lte: new Date() },
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              },
              include: {
                prices: { where: { packageId: parsedEvent.data.packageId }, take: 1 },
              },
              orderBy: { startsAt: "desc" },
            }),
          ]);
          if (!account) throw new Error("Akses mitra sudah tidak aktif.");
          if (!selectedPackage) throw new Error("Paket tersebut sudah tidak tersedia.");
          if (!isPackagePriceConfigured(selectedPackage.price, selectedPackage.currency)) {
            throw new Error("Harga paket ini belum diatur.");
          }
          const basePrice = selectedPackage.price.toNumber();
          const price = calculatePartnerPrice({
            basePrice,
            paidOrderCount: account.paidOrderCount,
            tiers,
            customPrice: agreement?.prices[0]?.price.toNumber(),
          });
          const snapshot = createPackageSnapshot(selectedPackage);
          const slugBase = slugifyEventName(parsedEvent.data.name);
          const matchingEvents = await transaction.event.findMany({
            where: { slug: { startsWith: slugBase } },
            select: { slug: true },
          });
          const slug = uniqueEventSlug(
            parsedEvent.data.name,
            new Set(matchingEvents.map((event) => event.slug)),
          );
          const destinationUrl = new URL(
            eventGuestPath(slug),
            publicEnv().NEXT_PUBLIC_APP_URL,
          ).toString();

          const event = await transaction.event.create({
            data: {
              ownerId: session.user.id,
              packageId: selectedPackage.id,
              status: "DRAFT",
              name: parsedEvent.data.name,
              organizerName: parsedEvent.data.organizerName || clientName.trim(),
              slug,
              eventType: parsedEvent.data.eventType,
              eventDate: new Date(`${parsedEvent.data.eventDate}T12:00:00.000Z`),
              startsAt: schedule.startsAt,
              endsAt: schedule.endsAt,
              timeZone: parsedEvent.data.timeZone,
              location: parsedEvent.data.location || null,
              description: parsedEvent.data.description || null,
              coverImageKey: parsedEvent.data.coverImageUrl || null,
              privacyMode: parsedEvent.data.privacyMode,
              qrCode: { create: { destinationUrl } },
              photoExperience: {
                create: {
                  filter: parsedEvent.data.filter,
                  frame: parsedEvent.data.frame,
                },
              },
            },
            select: { id: true },
          });
          const order = await transaction.order.create({
            data: {
              orderNumber: `OL-${randomUUID()}`,
              idempotencyKey,
              userId: session.user.id,
              packageId: selectedPackage.id,
              eventId: event.id,
              partnerAccountId: account.id,
              clientName: clientName.trim(),
              packageSnapshot: { ...snapshot, price: String(price.finalPrice) },
              priceSnapshot: {
                basePrice: String(price.basePrice),
                finalPrice: String(price.finalPrice),
                currency: selectedPackage.currency,
                discountPercent: price.discountPercent,
                paidOrdersAtPurchase: price.paidOrdersAtPurchase,
                tierMinPaidOrders: price.tierMinPaidOrders,
                customPriceApplied: price.customPriceApplied,
              },
              status: "PENDING",
              amount: new Prisma.Decimal(price.finalPrice),
              currency: selectedPackage.currency,
            },
            select: { id: true },
          });
          return order.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < 2) continue;
        if (isUniqueConstraintError(error) && attempt < 2) continue;
        throw error;
      }
    }

    if (!orderId) invalidOrder("unavailable");
    redirect(`/partner/orders/${orderId}?created=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (error instanceof Error && [
      "Partner access is no longer active.",
      "That package is no longer available.",
      "This package price has not been configured.",
    ].includes(error.message)) {
      invalidOrder("unavailable");
    }
    console.error("[partner-order] Could not create client event order.", error);
    invalidOrder("create");
  }
}

export async function createPartnerOrderFormAction(
  _previousState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  await createPartnerOrderAction(formData);
  return {};
}
