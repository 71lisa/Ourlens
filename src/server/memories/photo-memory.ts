import type { MediaType, Prisma } from "@prisma/client";

export function buildMemoryCreateInput(input: {
  eventId: string;
  guestSessionId: string;
  storageKey: string;
  optimizedStorageKey?: string;
  idempotencyKey: string;
  type: MediaType;
  mimeType: string;
  fileSize: bigint;
  caption?: string;
  duration?: number;
  expiresAt?: Date;
}): Prisma.MemoryCreateInput {
  const caption = input.caption || null;
  return {
    event: { connect: { id: input.eventId } },
    guestSession: { connect: { id: input.guestSessionId } },
    caption,
    mediaAssets: {
      create: {
        event: { connect: { id: input.eventId } },
        type: input.type,
        originalStorageKey: input.storageKey,
        optimizedStorageKey: input.optimizedStorageKey,
        idempotencyKey: input.idempotencyKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        duration: input.duration,
        uploadStatus: "COMPLETE",
        processingStatus: "SKIPPED",
        aiStatus: "NONE",
        moderationStatus: "PENDING",
        caption,
        expiresAt: input.expiresAt,
      },
    },
  };
}