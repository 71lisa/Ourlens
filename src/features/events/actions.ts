"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { publicEnv } from "@/lib/env";
import { eventGuestPath, slugifyEventName, uniqueEventSlug } from "@/lib/slug";
import { prisma } from "@/server/db/prisma";
import { createPackageSnapshot, isPackagePriceConfigured } from "@/server/packages/snapshot";
import { calculateBuyerPromotion } from "@/server/promotions/pricing";
import { createEventSchema, eventScheduleSchema, getEventSchedule } from "./schema";

export type CreateEventState = { error?: string; success?: string };

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

class InvalidVoucherSelectionError extends Error {}

export async function createEventAction(
  _previousState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    return { error: "Masuk dengan akun penyelenggara untuk membuat acara." };
  }

  const parsed = createEventSchema.safeParse({
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
    privacyMode: formData.get("privacyMode"),
    packageId: formData.get("packageId"),
    filter: formData.get("photoFilter") || undefined,
    frame: formData.get("photoFrame") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periksa kembali detail acara Anda." };
  }
  const idempotencyKey = formData.get("idempotencyKey");
  if (
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
  ) {
    return { error: "Permintaan acara tidak valid. Muat ulang halaman dan coba lagi." };
  }
  const schedule = getEventSchedule(parsed.data);
  if (!schedule || schedule.endsAt <= schedule.startsAt) {
    return { error: "Pilih waktu mulai dan berakhir yang valid sesuai zona waktu acara." };
  }
  const referralVoucherId = formData.get("referralVoucherId");
  if (referralVoucherId !== null && typeof referralVoucherId !== "string") {
    return { error: "Voucher referral yang dipilih tidak valid. Muat ulang halaman dan coba lagi." };
  }

  let existingOrder: { id: string; userId: string } | null = null;
  try {
    existingOrder = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true },
    });
  } catch (error) {
    console.error("[create-event] Could not check the request idempotency key.", error);
    return { error: "Permintaan acara tidak dapat diverifikasi. Silakan coba lagi." };
  }
  if (existingOrder) {
    if (existingOrder.userId !== session.user.id) {
      return { error: "Permintaan acara ini sudah pernah digunakan." };
    }
    redirect(`/dashboard/transactions/${existingOrder.id}?created=1`);
  }

  let selectedPackage;
  try {
    selectedPackage = await prisma.package.findFirst({
      where: { id: parsed.data.packageId, isActive: true },
    });
  } catch (error) {
    console.error("[create-event] Could not load package.", error);
    return { error: "Paket sedang tidak tersedia. Silakan coba lagi." };
  }
  if (!selectedPackage) {
    return { error: "Paket tersebut sudah tidak tersedia. Pilih paket lain." };
  }
  if (!isPackagePriceConfigured(selectedPackage.price, selectedPackage.currency)) {
    return { error: "Harga paket ini belum diatur. Hubungi OurLens sebelum membuat pesanan." };
  }

  let createdOrderId: string | undefined;
  for (let attempt = 0; attempt < 3 && !createdOrderId; attempt += 1) {
    try {
      createdOrderId = await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))::text`,
        );
        const existingOrder = await transaction.order.findUnique({
          where: { idempotencyKey },
          select: { id: true, userId: true },
        });
        if (existingOrder) {
          if (existingOrder.userId !== session.user.id) {
            throw new Error("Permintaan acara ini sudah pernah digunakan.");
          }
          return existingOrder.id;
        }

        await transaction.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`buyer-promotion:${session.user.id}`}))::text`,
        );
        const now = new Date();
        const promotionSettings = await transaction.promotionSettings.findUnique({
          where: { id: "global" },
          select: { firstEventActive: true, referralActive: true },
        });
        const isOrdinaryOrganizer = session.user.role === "ORGANIZER";
        const [previousPaidOrder, firstEventReservation] = isOrdinaryOrganizer
          ? await Promise.all([
              transaction.order.findFirst({
                where: {
                  userId: session.user.id,
                  partnerAccountId: null,
                  status: "PAID",
                },
                select: { id: true },
              }),
              transaction.order.findFirst({
                where: {
                  userId: session.user.id,
                  partnerAccountId: null,
                  status: "PENDING",
                  promotionType: "FIRST_EVENT",
                },
                select: { id: true },
              }),
            ])
          : [null, null];

        const selectedVoucherId = typeof referralVoucherId === "string" && referralVoucherId.length
          ? referralVoucherId
          : null;
        const voucher = selectedVoucherId
          ? await transaction.referralVoucher.findFirst({
              where: {
                id: selectedVoucherId,
                ownerId: session.user.id,
                status: "AVAILABLE",
                expiresAt: { gt: now },
              },
              select: { id: true, amount: true },
            })
          : null;
        if (selectedVoucherId && (
          !isOrdinaryOrganizer ||
          promotionSettings?.referralActive !== true ||
          !voucher
        )) {
          throw new InvalidVoucherSelectionError();
        }
        if (voucher && voucher.amount.gte(selectedPackage.price)) {
          throw new InvalidVoucherSelectionError();
        }

        const quote = calculateBuyerPromotion({
          baseAmount: selectedPackage.price.toNumber(),
          firstEventEligible: isOrdinaryOrganizer && !previousPaidOrder && !firstEventReservation,
          firstEventActive: promotionSettings?.firstEventActive === true,
          referralActive: promotionSettings?.referralActive === true,
          ...(voucher ? { voucherAmount: voucher.amount.toNumber() } : {}),
        });
        const slugBase = slugifyEventName(parsed.data.name);
        const matchingEvents = await transaction.event.findMany({
          where: { slug: { startsWith: slugBase } },
          select: { slug: true },
        });
        const slug = uniqueEventSlug(
          parsed.data.name,
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
            name: parsed.data.name,
            organizerName: parsed.data.organizerName || null,
            slug,
            eventType: parsed.data.eventType,
            eventDate: new Date(`${parsed.data.eventDate}T12:00:00.000Z`),
            startsAt: schedule.startsAt,
            endsAt: schedule.endsAt,
            timeZone: parsed.data.timeZone,
            location: parsed.data.location || null,
            description: parsed.data.description || null,
            coverImageKey: parsed.data.coverImageUrl || null,
            privacyMode: parsed.data.privacyMode,
            qrCode: { create: { destinationUrl } },
            photoExperience: {
              create: {
                filter: parsed.data.filter,
                frame: parsed.data.frame,
              },
            },
          },
          select: { id: true, name: true },
        });

        const order = await transaction.order.create({
          data: {
            orderNumber: `OL-${randomUUID()}`,
            idempotencyKey,
            userId: session.user.id,
            packageId: selectedPackage.id,
            eventId: event.id,
            packageSnapshot: createPackageSnapshot(selectedPackage),
            status: "PENDING",
            amount: new Prisma.Decimal(quote.finalAmount),
            currency: selectedPackage.currency,
            baseAmount: new Prisma.Decimal(quote.baseAmount),
            discountAmount: new Prisma.Decimal(quote.discountAmount),
            promotionType: quote.promotionType,
            priceSnapshot: {
              baseAmount: quote.baseAmount,
              discountAmount: quote.discountAmount,
              finalAmount: quote.finalAmount,
              promotionType: quote.promotionType,
              referralVoucherId: voucher?.id ?? null,
              currency: selectedPackage.currency,
            },
          },
          select: { id: true },
        });
        if (voucher) {
          const reserved = await transaction.referralVoucher.updateMany({
            where: {
              id: voucher.id,
              ownerId: session.user.id,
              status: "AVAILABLE",
              expiresAt: { gt: now },
              orderId: null,
            },
            data: { status: "RESERVED", orderId: order.id },
          });
          if (reserved.count !== 1) throw new InvalidVoucherSelectionError();
        }
        return order.id;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const idempotentOrder = await prisma.order.findUnique({
          where: { idempotencyKey },
          select: { id: true, userId: true },
        });
        if (idempotentOrder?.userId === session.user.id) {
          createdOrderId = idempotentOrder.id;
          break;
        }
      }
      if (
        isUniqueConstraintError(error) &&
        attempt < 2
      ) {
        continue;
      }
      if (error instanceof InvalidVoucherSelectionError) {
        return { error: "Voucher ini sudah digunakan, kedaluwarsa, atau tidak memenuhi syarat." };
      }
      console.error("[create-event] Event creation failed.", error);
      return { error: "Acara belum dapat dibuat saat ini. Silakan coba lagi." };
    }
  }

  if (!createdOrderId) {
    return { error: "Pesanan tidak dapat dibuat. Silakan coba lagi." };
  }

  redirect(`/dashboard/transactions/${createdOrderId}?created=1`);
}

export async function updateEventScheduleAction(
  _previousState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !eventId) {
    return { error: "Jadwal acara tidak valid. Muat ulang halaman dan coba lagi." };
  }

  const parsed = eventScheduleSchema.safeParse({
    eventDate: formData.get("eventDate"),
    startTime: formData.get("startTime"),
    endDate: formData.get("endDate"),
    endTime: formData.get("endTime"),
    timeZone: formData.get("timeZone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pilih jadwal acara yang valid." };
  }
  const schedule = getEventSchedule(parsed.data);
  if (!schedule || schedule.endsAt <= schedule.startsAt) {
    return { error: "Pilih waktu mulai dan berakhir yang valid sesuai zona waktu acara." };
  }

  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    return { error: "Masuk sebagai penyelenggara untuk mengubah acara ini." };
  }
  const event = await prisma.event.findFirst({
    where: session.user.role === "ADMIN"
      ? { id: eventId }
      : { id: eventId, ownerId: session.user.id },
    select: { id: true, slug: true },
  });
  if (!event) return { error: "Acara tidak ditemukan atau Anda tidak memiliki izin untuk mengubahnya." };

  try {
    await prisma.event.update({
      where: { id: event.id },
      data: {
        eventDate: new Date(`${parsed.data.eventDate}T12:00:00.000Z`),
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        timeZone: parsed.data.timeZone,
      },
    });
  } catch (error) {
    console.error("[event-schedule] Could not update event schedule.", error);
    return { error: "Jadwal acara tidak dapat diperbarui. Silakan coba lagi." };
  }

  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/dashboard/events`);
  revalidatePath(`/e/${event.slug}`);
  revalidatePath(`/e/${event.slug}/gallery`);
  return { success: "Jadwal acara berhasil diperbarui." };
}