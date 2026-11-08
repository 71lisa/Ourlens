"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { PHOTO_FILTERS, PHOTO_FRAMES } from "@/features/memories/media-studio-config";
import { prisma } from "@/server/db/prisma";

export type PhotoExperienceActionState = { error?: string; success?: string };

export async function savePhotoExperienceAction(
  _previousState: PhotoExperienceActionState,
  formData: FormData,
): Promise<PhotoExperienceActionState> {
  const eventId = formData.get("eventId");
  const filterValue = formData.get("filter");
  const frameValue = formData.get("frame");
  const filter = typeof filterValue === "string"
    ? PHOTO_FILTERS.find((option) => option.id === filterValue)?.id
    : undefined;
  const frame = typeof frameValue === "string"
    ? PHOTO_FRAMES.find((option) => option.id === frameValue)?.id
    : undefined;
  if (typeof eventId !== "string" || !eventId || !filter || !frame) {
    return { error: "Pilih filter foto dan bingkai yang valid." };
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
    await prisma.photoExperience.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, filter, frame },
      update: { filter, frame },
    });
  } catch (error) {
    console.error("[photo-experience] Could not update event photo settings.", error);
    return { error: "Pengaturan tampilan foto tidak dapat disimpan. Silakan coba lagi." };
  }

  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/e/${event.slug}`);
  revalidatePath(`/e/${event.slug}/gallery`);
  return { success: "Pengaturan tampilan foto berhasil disimpan." };
}
