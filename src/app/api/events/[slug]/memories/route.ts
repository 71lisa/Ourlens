import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { hashGuestToken, readGuestToken } from "@/lib/guest-token";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  validateMediaFile,
  validatePhotoPayload,
} from "@/lib/media/file-validation";
import { consumeRateLimit, getRateLimitClientKey } from "@/lib/rate-limit";
import { buildStorageKey, isSafeStorageKey } from "@/lib/storage-keys";
import { canAcceptGuestContributions } from "@/server/authorization/policies";
import { prisma } from "@/server/db/prisma";
import { isPhotoLimitReached } from "@/server/promotions/free-trial";
import {
  getPackageGuestCapacity,
  getRemainingPhotoQuota,
  GUEST_PHOTO_LIMIT,
  hasGuestUploadCapacity,
} from "@/lib/photo-quota";
import { buildMemoryCreateInput } from "@/server/memories/photo-memory";
import { DEFAULT_PHOTO_EXPERIENCE } from "@/features/memories/media-studio-config";
import { InvalidPhotoError, renderGuestPhoto } from "@/services/media/image-processing/server";
import { getStorageService } from "@/services/storage";
import { hasValidRequestOrigin } from "@/lib/request-origin";
import { parsePackageSnapshot } from "@/server/packages/snapshot";

const CAPTION_MAX_LENGTH = 300;
const MAX_UPLOAD_REQUEST_BYTES = MAX_PHOTO_UPLOAD_BYTES * 2 + 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function safeCaption(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized ? normalized.slice(0, CAPTION_MAX_LENGTH) : undefined;
}

function isIdempotencyKey(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Permintaan tidak dapat diverifikasi." }, { status: 403 });
  }

  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      eventDate: true,
      privacyMode: true,
      status: true,
      expiresAt: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      orders: { where: { status: "PAID" }, select: { id: true, packageSnapshot: true }, take: 1 },
      freeTrial: { select: { photoLimit: true } },
      package: {
        select: {
          name: true,
          guestCapacity: true,
          isUnlimited: true,
          retentionDays: true,
        },
      },
      storageUsage: { select: { id: true } },
      photoExperience: { select: { filter: true, frame: true } },
    },
  });
  const guestAccessEvent = event
    ? { ...event, isPaid: event.orders.length > 0, isTrial: Boolean(event.freeTrial) }
    : null;
  const now = new Date();
  if (!event || !guestAccessEvent || !canAcceptGuestContributions(guestAccessEvent, now)) {
    return NextResponse.json({ error: "Acara ini tidak menerima kontribusi." }, { status: 404 });
  }

  const token = readGuestToken(request, slug);
  if (!token) {
    return NextResponse.json({ error: "Mulai sesi tamu sebelum mengunggah." }, { status: 401 });
  }

  const guestSession = await prisma.guestSession.findFirst({
    where: {
      eventId: event.id,
      tokenHash: hashGuestToken(token),
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!guestSession) {
    return NextResponse.json({ error: "Sesi tamu Anda telah berakhir. Buka kembali acara ini untuk melanjutkan." }, { status: 401 });
  }

  const ipUploadLimit = consumeRateLimit(
    `guest-upload-ip:${event.id}:${getRateLimitClientKey(request)}`,
    20,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!ipUploadLimit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak unggahan dari jaringan ini. Silakan tunggu sebelum mencoba lagi." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(ipUploadLimit.retryAfterMs / 1000)) },
      },
    );
  }

  const uploadLimit = consumeRateLimit(
    `guest-upload:${event.id}:${hashGuestToken(token)}`,
    10,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!uploadLimit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak unggahan. Silakan tunggu sebelum mencoba lagi." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(uploadLimit.retryAfterMs / 1000)) },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ error: "Ukuran unggahan melebihi batas acara." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Pilih foto yang valid untuk diunggah." }, { status: 400 });
  }

  const kindValue = formData.get("kind");
  if (kindValue !== "photo") {
    return NextResponse.json({ error: "Hanya unggahan foto yang didukung." }, { status: 400 });
  }
  const mediaEntry = formData.get("photo");
  if (!(mediaEntry instanceof File)) {
    return NextResponse.json({ error: "Pilih foto untuk diunggah." }, { status: 400 });
  }

  const originalEntry = formData.get("original");
  if (originalEntry !== null && !(originalEntry instanceof File)) {
    return NextResponse.json({ error: "Berkas media asli tidak valid." }, { status: 400 });
  }
  const original = originalEntry instanceof File ? originalEntry : mediaEntry;
  for (const file of original === mediaEntry ? [mediaEntry] : [mediaEntry, original]) {
    if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Pilih foto yang ukurannya kurang dari 8 MB." }, { status: 413 });
    }
    const preliminaryValidation = validateMediaFile({
      mimeType: file.type,
      fileSize: file.size,
      kind: "photo",
      fileName: file.name,
    });
    if (!preliminaryValidation.ok) {
      return NextResponse.json(
        { error: preliminaryValidation.error ?? "Berkas media ini tidak valid." },
        { status: 400 },
      );
    }
  }

  const idempotencyKey = formData.get("idempotencyKey");
  if (!isIdempotencyKey(idempotencyKey)) {
    return NextResponse.json({ error: "Permintaan unggahan tidak valid. Silakan coba lagi." }, { status: 400 });
  }
  if (!event.storageUsage) {
    return NextResponse.json({ error: "Penyimpanan belum dikonfigurasi untuk acara ini." }, { status: 409 });
  }

  const bytes = new Uint8Array(await mediaEntry.arrayBuffer());
  const originalBytes = original === mediaEntry
    ? bytes
    : new Uint8Array(await original.arrayBuffer());
  const photoValidation = validatePhotoPayload({
    bytes,
    mimeType: mediaEntry.type,
    fileSize: mediaEntry.size,
    fileName: mediaEntry.name,
  });
  const originalPhotoValidation = original === mediaEntry
    ? photoValidation
    : validatePhotoPayload({
        bytes: originalBytes,
        mimeType: original.type,
        fileSize: original.size,
        fileName: original.name,
      });

  if (!photoValidation.ok) {
    return NextResponse.json({ error: photoValidation.error }, { status: 400 });
  }
  if (!originalPhotoValidation.ok) {
    return NextResponse.json(
      { error: `Original media: ${originalPhotoValidation.error}` },
      { status: 400 },
    );
  }
  let processedPhotoBytes: Buffer;
  try {
    processedPhotoBytes = await renderGuestPhoto({
      bytes: originalBytes,
      filter: event.photoExperience?.filter ?? DEFAULT_PHOTO_EXPERIENCE.filter,
      frame: event.photoExperience?.frame ?? DEFAULT_PHOTO_EXPERIENCE.frame,
      eventName: event.name,
      eventDate: event.eventDate,
    });
  } catch (error) {
    if (error instanceof InvalidPhotoError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[guest-upload] Photo processing failed.", error);
    return NextResponse.json({ error: "Foto tidak dapat diproses. Silakan coba gambar lain." }, { status: 500 });
  }

  const challengeId = formData.get("challengeId");
  const challengePromptId = typeof challengeId === "string" && challengeId.length > 0
    ? challengeId
    : null;
  const selectedChallenge = challengePromptId
    ? await prisma.challenge.findFirst({
        where: { id: challengePromptId, eventId: event.id, active: true },
        select: { id: true },
      })
    : null;
  if (challengeId && !selectedChallenge) {
    return NextResponse.json({ error: "Tantangan acara ini sudah tidak tersedia." }, { status: 400 });
  }

  const mediaType = "PHOTO";
  const storageKind = "photo";
  const assetKey = crypto.randomUUID();
  const originalMimeType = originalPhotoValidation.mimeType;
  const mediaMimeType = "image/jpeg";
  const extensionFor = (mimeType: string) => {
    if (mimeType === "image/jpeg") return "jpg";
    return mimeType.split("/")[1];
  };
  const originalStorageKey = buildStorageKey({
    eventId: event.id,
    mediaId: assetKey,
    kind: storageKind,
    variant: "original",
    suffix: `.${extensionFor(originalMimeType)}`,
  });
  const optimizedStorageKey = buildStorageKey({
    eventId: event.id,
    mediaId: assetKey,
    kind: storageKind,
    variant: "edited",
    suffix: `.${extensionFor(mediaMimeType)}`,
  });
  if (!isSafeStorageKey(originalStorageKey) || !isSafeStorageKey(optimizedStorageKey)) {
    return NextResponse.json({ error: "Berkas media ini tidak dapat disimpan di lokasi yang aman." }, { status: 400 });
  }

  const storedBytes = BigInt(originalBytes.byteLength + processedPhotoBytes.byteLength);
  const expiresAt = event.package
    ? new Date(now.getTime() + event.package.retentionDays * 24 * 60 * 60 * 1000)
    : undefined;
  const caption = safeCaption(formData.get("caption"));
  const storageKeys: string[] = [];

  let result: {
    duplicate: boolean;
    photoQuota: {
      scope: "guest" | "event";
      uploaded: number;
      limit: number;
      remaining: number;
      participantCount: number | null;
      participantLimit: number | null;
      canUpload: boolean;
    };
  };
  try {
    const storage = getStorageService();
    result = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${event.id}))::text`,
      );
      const lockedEvent = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR SHARE`,
      );
      if (lockedEvent.length !== 1) throw new Error("UPLOAD_EVENT_CLOSED");
      const currentEvent = await transaction.event.findUnique({
        where: { id: event.id },
        select: {
          privacyMode: true,
          status: true,
          expiresAt: true,
          startsAt: true,
          endsAt: true,
          timeZone: true,
          orders: { where: { status: "PAID" }, select: { id: true, packageSnapshot: true }, take: 1 },
          freeTrial: { select: { photoLimit: true } },
          package: { select: { name: true, guestCapacity: true, isUnlimited: true } },
        },
      });
      const currentGuestAccessEvent = currentEvent
        ? { ...currentEvent, isPaid: currentEvent.orders.length > 0, isTrial: Boolean(currentEvent.freeTrial) }
        : null;
      if (!currentGuestAccessEvent || !canAcceptGuestContributions(currentGuestAccessEvent, new Date())) {
        throw new Error("UPLOAD_EVENT_CLOSED");
      }

      const existing = await transaction.mediaAsset.findUnique({
        where: { eventId_idempotencyKey: { eventId: event.id, idempotencyKey } },
        select: { type: true, uploadStatus: true },
      });
      const currentGuestPhotoCount = await transaction.mediaAsset.count({
        where: {
          eventId: event.id,
          type: mediaType,
          uploadStatus: "COMPLETE",
          ...(currentEvent?.freeTrial
            ? {}
            : { memory: { is: { guestSessionId: guestSession.id } } }),
        },
      });
      const trialLimit = currentEvent?.freeTrial?.photoLimit ?? 10;
      const participantCount = currentEvent?.freeTrial
        ? 0
        : await transaction.guestSession.count({
            where: {
              eventId: event.id,
              memories: {
                some: {
                  mediaAssets: {
                    some: { type: "PHOTO", uploadStatus: "COMPLETE" },
                  },
                },
              },
            },
          });
      const packageSnapshot = parsePackageSnapshot(currentEvent?.orders[0]?.packageSnapshot);
          const snapshotGuestCapacity = getPackageGuestCapacity(packageSnapshot);
          const guestCapacity = snapshotGuestCapacity === 0
            ? getPackageGuestCapacity(currentEvent?.package)
            : snapshotGuestCapacity;
      if (existing) {
        if (existing.type !== mediaType) throw new Error("UPLOAD_IDEMPOTENCY_KEY_REUSED");
        if (existing.uploadStatus !== "COMPLETE") throw new Error("UPLOAD_ALREADY_IN_PROGRESS");
        const remaining = getRemainingPhotoQuota(
          currentGuestPhotoCount,
          currentEvent?.freeTrial ? trialLimit : GUEST_PHOTO_LIMIT,
        );
        return {
          duplicate: true,
          photoQuota: {
            scope: currentEvent?.freeTrial ? "event" : "guest",
            uploaded: currentGuestPhotoCount,
            limit: currentEvent?.freeTrial ? trialLimit : GUEST_PHOTO_LIMIT,
            remaining,
            participantCount: currentEvent?.freeTrial ? null : participantCount,
            participantLimit: currentEvent?.freeTrial ? null : guestCapacity,
            canUpload: currentEvent?.freeTrial
              ? remaining > 0
              : remaining > 0 && hasGuestUploadCapacity({
                  participantCount,
                  guestPhotoCount: currentGuestPhotoCount,
                  guestCapacity,
                }),
          },
        };
      }

      if (currentEvent?.freeTrial) {
        const eventPhotoCount = await transaction.mediaAsset.count({
          where: { eventId: event.id, type: mediaType, uploadStatus: "COMPLETE" },
        });
        if (isPhotoLimitReached(eventPhotoCount, trialLimit)) {
          throw new Error("EVENT_PHOTO_LIMIT_REACHED");
        }
      } else {
        if (isPhotoLimitReached(currentGuestPhotoCount, GUEST_PHOTO_LIMIT)) {
          throw new Error("GUEST_PHOTO_LIMIT_REACHED");
        }
        if (!hasGuestUploadCapacity({
          participantCount,
          guestPhotoCount: currentGuestPhotoCount,
          guestCapacity,
        })) {
          throw new Error("EVENT_GUEST_CAPACITY_REACHED");
        }
      }

      const reserved = await transaction.$executeRaw(Prisma.sql`
        UPDATE "StorageUsage"
        SET "usedBytes" = "usedBytes" + ${storedBytes},
            "photoBytes" = "photoBytes" + ${storedBytes},
            "updatedAt" = NOW()
        WHERE "eventId" = ${event.id}
          AND "quotaBytes" - "usedBytes" >= ${storedBytes}
      `);
      if (reserved !== 1) throw new Error("EVENT_STORAGE_QUOTA_EXCEEDED");

      storageKeys.push(originalStorageKey);
      await storage.putObject({
        key: originalStorageKey,
        body: originalBytes,
        contentType: originalMimeType,
      });
      storageKeys.push(optimizedStorageKey);
      await storage.putObject({
        key: optimizedStorageKey,
        body: processedPhotoBytes,
        contentType: mediaMimeType,
      });

      const finalEvent = await transaction.event.findUnique({
        where: { id: event.id },
        select: {
          privacyMode: true,
          status: true,
          expiresAt: true,
          startsAt: true,
          endsAt: true,
          timeZone: true,
          orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
          freeTrial: { select: { id: true } },
        },
      });
      const finalGuestAccessEvent = finalEvent
        ? { ...finalEvent, isPaid: finalEvent.orders.length > 0, isTrial: Boolean(finalEvent.freeTrial) }
        : null;
      if (!finalGuestAccessEvent || !canAcceptGuestContributions(finalGuestAccessEvent, new Date())) {
        throw new Error("UPLOAD_EVENT_CLOSED");
      }
      const memory = await transaction.memory.create({
        data: buildMemoryCreateInput({
          eventId: event.id,
          guestSessionId: guestSession.id,
          storageKey: originalStorageKey,
          optimizedStorageKey,
          idempotencyKey,
          type: mediaType,
          mimeType: mediaMimeType,
          fileSize: BigInt(original.size),
          caption,
          expiresAt,
        }),
      });
      if (selectedChallenge) {
        await transaction.challengeSubmission.create({
          data: { challengeId: selectedChallenge.id, memoryId: memory.id },
        });
      }

      const uploaded = currentGuestPhotoCount + 1;
      const limit = currentEvent?.freeTrial ? trialLimit : GUEST_PHOTO_LIMIT;
      const remaining = getRemainingPhotoQuota(uploaded, limit);
      const participantsAfter = participantCount + (currentGuestPhotoCount === 0 ? 1 : 0);
      return {
        duplicate: false,
        photoQuota: {
          scope: currentEvent?.freeTrial ? "event" : "guest",
          uploaded,
          limit,
          remaining,
          participantCount: currentEvent?.freeTrial ? null : participantsAfter,
          participantLimit: currentEvent?.freeTrial ? null : guestCapacity,
          canUpload: currentEvent?.freeTrial
            ? remaining > 0
            : remaining > 0 && hasGuestUploadCapacity({
                participantCount: participantsAfter,
                guestPhotoCount: uploaded,
                guestCapacity,
              }),
        },
      };
    }, { maxWait: 10_000, timeout: 120_000 });

  } catch (error) {
    for (const key of storageKeys) {
      try {
        await getStorageService().deleteObject(key);
      } catch (cleanupError) {
        console.error("[guest-upload] Could not remove an uncommitted file.", cleanupError);
      }
    }
    if (error instanceof Error && error.message === "UPLOAD_ALREADY_IN_PROGRESS") {
      return NextResponse.json({ error: "Unggahan ini sedang diproses. Silakan tunggu." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "UPLOAD_EVENT_CLOSED") {
      return NextResponse.json({ error: "Acara ini sudah tidak menerima kontribusi." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "UPLOAD_IDEMPOTENCY_KEY_REUSED") {
      return NextResponse.json({ error: "Kunci permintaan unggahan ini sudah pernah digunakan." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "EVENT_STORAGE_QUOTA_EXCEEDED") {
      return NextResponse.json({ error: "Penyimpanan acara ini sudah mencapai batas." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "EVENT_PHOTO_LIMIT_REACHED") {
      return NextResponse.json({ error: "Acara ini sudah mencapai batas jumlah foto." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "GUEST_PHOTO_LIMIT_REACHED") {
      return NextResponse.json({ error: "Batas unggah 20 foto telah tercapai." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "EVENT_GUEST_CAPACITY_REACHED") {
      return NextResponse.json({ error: "Kapasitas tamu acara sudah penuh. Tamu baru tidak dapat mengunggah foto." }, { status: 409 });
    }
    console.error("[guest-upload] Media upload failed.", error);
    return NextResponse.json({ error: "Momen ini tidak dapat disimpan. Silakan coba lagi." }, { status: 500 });
  }

  revalidatePath(`/e/${slug}/gallery`);
  revalidatePath(`/dashboard/events/${event.id}`);
  return NextResponse.json(
    { success: true, photoQuota: result.photoQuota },
    { status: result.duplicate ? 200 : 201 },
  );
}
