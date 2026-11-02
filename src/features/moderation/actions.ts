"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { canModerateEvent } from "@/server/authorization/policies";
import { prisma } from "@/server/db/prisma";

export type ModerationActionState = { error?: string; success?: string };

export async function moderateMemoryAction(
  _previousState: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const eventId = formData.get("eventId");
  const mediaAssetId = formData.get("mediaAssetId");
  const decision = formData.get("decision");
  if (
    typeof eventId !== "string" ||
    typeof mediaAssetId !== "string" ||
    (decision !== "APPROVED" && decision !== "REJECTED")
  ) {
    return { error: "This review action is invalid. Refresh and try again." };
  }

  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    return { error: "You are not authorized to review this memory." };
  }

  const event = await prisma.event.findFirst({
    where: session.user.role === "ADMIN"
      ? { id: eventId }
      : { id: eventId, ownerId: session.user.id },
    select: { id: true, ownerId: true, slug: true },
  });
  if (!event || !canModerateEvent(session.user, event)) {
    return { error: "This event was not found or you do not have permission to review it." };
  }

  const updated = await prisma.mediaAsset.updateMany({
    where: {
      id: mediaAssetId,
      eventId: event.id,
      type: { in: ["PHOTO", "VIDEO"] },
      uploadStatus: "COMPLETE",
      moderationStatus: "PENDING",
    },
    data: { moderationStatus: decision },
  });
  if (updated.count !== 1) {
    return { error: "This memory has already been reviewed or is no longer available." };
  }

  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/dashboard/events/${event.id}/moderation`);
  revalidatePath(`/e/${event.slug}/gallery`);
  revalidatePath("/api/events/[slug]/media/[mediaId]", "page");

  return { success: decision === "APPROVED" ? "Memory approved." : "Memory rejected." };
}