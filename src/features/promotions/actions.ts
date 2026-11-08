"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { publicEnv } from "@/lib/env";
import { eventGuestPath, slugifyEventName, uniqueEventSlug } from "@/lib/slug";
import { DEFAULT_PHOTO_EXPERIENCE } from "@/features/memories/media-studio-config";
import { prisma } from "@/server/db/prisma";

export type FreeTrialActionState = { error?: string };

export async function updatePromotionSettingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const setting = formData.get("setting");
  const enabled = formData.get("enabled");
  if (
    (setting !== "firstEventActive" && setting !== "referralActive") ||
    (enabled !== "true" && enabled !== "false")
  ) {
    redirect("/admin/promotions?error=invalid-setting");
  }
  const value = enabled === "true";
  await prisma.promotionSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      firstEventActive: setting === "firstEventActive" ? value : true,
      referralActive: setting === "referralActive" ? value : true,
      updatedById: session.user.id,
    },
    update: {
      ...(setting === "firstEventActive"
        ? { firstEventActive: value }
        : { referralActive: value }),
      updatedById: session.user.id,
    },
  });
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions?updated=1");
}

export async function createFreeTrialAction(
  _previousState: FreeTrialActionState,
  formData: FormData,
): Promise<FreeTrialActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ORGANIZER") {
    return { error: "Masuk dengan akun penyelenggara untuk menggunakan uji coba gratis." };
  }
  const eventName = formData.get("name");
  if (typeof eventName !== "string" || eventName.trim().length < 2 || eventName.trim().length > 120) {
    return { error: "Nama acara harus berisi 2–120 karakter." };
  }

  const existingTrial = await prisma.freeTrial.findUnique({
    where: { userId: session.user.id },
    select: { event: { select: { slug: true } } },
  });
  if (existingTrial) redirect(`/dashboard/trial?event=${encodeURIComponent(existingTrial.event.slug)}`);

  try {
    const trialEvent = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`free-trial:${session.user.id}`}))::text`,
      );
      const currentTrial = await transaction.freeTrial.findUnique({
        where: { userId: session.user.id },
        select: { event: { select: { slug: true } } },
      });
      if (currentTrial) return currentTrial.event;

      const baseSlug = slugifyEventName(eventName.trim());
      const existingEvents = await transaction.event.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      });
      const slug = uniqueEventSlug(
        `${baseSlug}-trial`,
        new Set(existingEvents.map((event) => event.slug)),
      );
      const destinationUrl = new URL(
        eventGuestPath(slug),
        publicEnv().NEXT_PUBLIC_APP_URL,
      ).toString();
      const now = new Date();
      const event = await transaction.event.create({
        data: {
          ownerId: session.user.id,
          name: eventName.trim(),
          slug,
          eventType: "OTHER",
          eventDate: now,
          startsAt: now,
          endsAt: null,
          timeZone: "Asia/Jakarta",
          status: "LIVE",
          privacyMode: "PUBLIC_LINK",
          qrCode: { create: { destinationUrl } },
          photoExperience: {
            create: {
              filter: DEFAULT_PHOTO_EXPERIENCE.filter,
              frame: DEFAULT_PHOTO_EXPERIENCE.frame,
            },
          },
          storageUsage: {
            create: { quotaBytes: BigInt(250 * 1024 * 1024) },
          },
          freeTrial: {
            create: {
              photoLimit: 10,
              expiresAt: null,
              user: { connect: { id: session.user.id } },
            },
          },
        },
        select: { slug: true },
      });
      return event;
    });
    revalidatePath("/dashboard/trial");
    revalidatePath("/dashboard/events");
    redirect(`/dashboard/trial?event=${encodeURIComponent(trialEvent.slug)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[free-trial] Could not create the trial event.", error);
    return { error: "Acara uji coba gratis tidak dapat dibuat saat ini. Silakan coba kembali." };
  }
}