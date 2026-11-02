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
import { createEventSchema, eventScheduleSchema, getEventSchedule } from "./schema";

export type CreateEventState = { error?: string; success?: string };

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function createEventAction(
  _previousState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    return { error: "Please sign in with an organizer account to create an event." };
  }

  const parsed = createEventSchema.safeParse({
    name: formData.get("name"),
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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your event details." };
  }
  const idempotencyKey = formData.get("idempotencyKey");
  if (
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
  ) {
    return { error: "This event request is invalid. Refresh and try again." };
  }
  const schedule = getEventSchedule(parsed.data);
  if (!schedule || schedule.endsAt <= schedule.startsAt) {
    return { error: "Choose a valid event start and end in the selected time zone." };
  }

  let existingOrder: { id: string; userId: string } | null = null;
  try {
    existingOrder = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true },
    });
  } catch (error) {
    console.error("[create-event] Could not check the request idempotency key.", error);
    return { error: "We could not verify this event request. Please try again." };
  }
  if (existingOrder) {
    if (existingOrder.userId !== session.user.id) {
      return { error: "This event request has already been used." };
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
    return { error: "Packages are temporarily unavailable. Please try again." };
  }
  if (!selectedPackage) {
    return { error: "That package is no longer available. Choose another package." };
  }
  if (!isPackagePriceConfigured(selectedPackage.price, selectedPackage.currency)) {
    return { error: "This package price has not been configured. Please contact OurLens before creating an order." };
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
            throw new Error("This event request has already been used.");
          }
          return existingOrder.id;
        }

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
            amount: selectedPackage.price,
            currency: selectedPackage.currency,
          },
          select: { id: true },
        });
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
      console.error("[create-event] Event creation failed.", error);
      return { error: "We could not create this event right now. Please try again." };
    }
  }

  if (!createdOrderId) {
    return { error: "We could not create your order. Please try again." };
  }

  redirect(`/dashboard/transactions/${createdOrderId}?created=1`);
}

export async function updateEventScheduleAction(
  _previousState: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !eventId) {
    return { error: "This event schedule is invalid. Refresh and try again." };
  }

  const parsed = eventScheduleSchema.safeParse({
    eventDate: formData.get("eventDate"),
    startTime: formData.get("startTime"),
    endDate: formData.get("endDate"),
    endTime: formData.get("endTime"),
    timeZone: formData.get("timeZone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a valid event schedule." };
  }
  const schedule = getEventSchedule(parsed.data);
  if (!schedule || schedule.endsAt <= schedule.startsAt) {
    return { error: "Choose a valid event start and end in the selected time zone." };
  }

  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    return { error: "Please sign in as an organizer to update this event." };
  }
  const event = await prisma.event.findFirst({
    where: session.user.role === "ADMIN"
      ? { id: eventId }
      : { id: eventId, ownerId: session.user.id },
    select: { id: true, slug: true },
  });
  if (!event) return { error: "This event was not found or you do not have permission to edit it." };

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
    return { error: "We could not update this event schedule. Please try again." };
  }

  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/dashboard/events`);
  revalidatePath(`/e/${event.slug}`);
  revalidatePath(`/e/${event.slug}/gallery`);
  return { success: "Event schedule updated." };
}