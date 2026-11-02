import { describe, expect, it } from "vitest";
import { uniqueEventSlug, slugifyEventName } from "@/lib/slug";
import { createEventSchema } from "@/features/events/schema";
import { hashGuestToken, readGuestToken } from "@/lib/guest-token";
import {
  detectPhotoMimeType,
  hasAllowedMediaExtension,
  MAX_PHOTO_UPLOAD_BYTES,
  validateMediaFile,
  validatePhotoPayload,
} from "@/lib/media/file-validation";
import { PHOTO_FILTERS, PHOTO_FRAMES } from "@/features/memories/media-studio-config";
import { canAcceptUpload } from "@/lib/storage-quota";
import {
  canAcceptGuestContributions,
  canAccessGuestEventPage,
  canModerateEvent,
  canUploadToEvent,
  canViewEventGallery,
  getEffectiveGuestEventStatus,
  isGalleryModerationVisible,
  isRetainedMediaAvailable,
} from "@/server/authorization/policies";
import { getOrCreateGuestSession } from "@/server/guests/session";
import { buildMemoryCreateInput } from "@/server/memories/photo-memory";
import { buildStorageKey, isSafeStorageKey } from "@/lib/storage-keys";
import { isValidTimeZone, resolveZonedDateTime } from "@/lib/event-schedule";

describe("event creation validation", () => {
  it("requires event name, type, date, privacy, and package", () => {
    expect(createEventSchema.safeParse({}).success).toBe(false);
  });

  it("accepts supported event details and normalizes an empty cover URL", () => {
    const result = createEventSchema.safeParse({
      name: " Audrey & John ",
      eventType: "WEDDING",
      eventDate: "2027-06-12",
      startTime: "17:00",
      endDate: "2027-06-12",
      endTime: "23:00",
      timeZone: "Asia/Jakarta",
      location: "Jakarta",
      description: "A day together",
      coverImageUrl: "",
      privacyMode: "PUBLIC_LINK",
      packageId: "package-id",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.coverImageUrl).toBeUndefined();
  });

  it("rejects invalid time zones and non-increasing event schedules", () => {
    const base = {
      name: "Celebration",
      eventType: "WEDDING",
      eventDate: "2027-06-12",
      startTime: "17:00",
      endDate: "2027-06-12",
      endTime: "23:00",
      timeZone: "Asia/Jakarta",
      privacyMode: "PUBLIC_LINK",
      packageId: "package-id",
    };
    expect(createEventSchema.safeParse({ ...base, timeZone: "not/a-zone" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, endTime: "16:00" }).success).toBe(false);
  });
});

describe("event local-time conversion", () => {
  it("converts local times using the selected IANA timezone", () => {
    expect(resolveZonedDateTime("2027-06-12", "17:00", "Asia/Jakarta")?.toISOString())
      .toBe("2027-06-12T10:00:00.000Z");
  });

  it("rejects nonexistent and ambiguous daylight-saving wall times", () => {
    expect(resolveZonedDateTime("2027-03-14", "02:30", "America/New_York")).toBeUndefined();
    expect(resolveZonedDateTime("2027-11-07", "01:30", "America/New_York")).toBeUndefined();
    expect(isValidTimeZone("not/a-zone")).toBe(false);
  });
});
describe("event URL slugs", () => {
  it("creates a human-readable unique slug", () => {
    const first = slugifyEventName("Audrey & John Wedding");
    expect(first).toBe("audrey-john-wedding");
    expect(uniqueEventSlug("Audrey & John Wedding", new Set([first]))).toBe(
      "audrey-john-wedding-2",
    );
  });
});

describe("guest session", () => {
  it("creates a random token and reuses it for the same active event session", async () => {
    const records = new Map<string, { id: string; expiresAt: Date }>();
    const store = {
      async findValid(eventId: string, tokenHash: string, now: Date) {
        const record = records.get(`${eventId}:${tokenHash}`);
        return record && record.expiresAt > now ? record : null;
      },
      async create(eventId: string, tokenHash: string, expiresAt: Date) {
        const record = { id: "session-id", expiresAt };
        records.set(`${eventId}:${tokenHash}`, record);
        return record;
      },
    };
    const now = new Date("2026-09-27T00:00:00.000Z");
    const created = await getOrCreateGuestSession({ eventId: "event-1", store, now });
    const reused = await getOrCreateGuestSession({
      eventId: "event-1",
      existingToken: created.token,
      store,
      now,
    });

    expect(created.reused).toBe(false);
    expect(created.token).toHaveLength(64);
    expect(hashGuestToken(created.token)).not.toBe(created.token);
    expect(readGuestToken(new Request("https://ourlens.test", {
      headers: { cookie: `other=abc; ourlens_guest_event-1=${created.token}` },
    }), "event-1")).toBe(created.token);
    expect(reused.reused).toBe(true);
    expect(reused.session.id).toBe(created.session.id);
  });
});

describe("photo upload rules", () => {
  it("detects supported JPEG and PNG signatures and rejects mislabeled bytes", () => {
    expect(detectPhotoMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectPhotoMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectPhotoMimeType(new Uint8Array([0x00, 0x01, 0x02]))).toBeUndefined();
  });

  it("accepts files at the centralized maximum and rejects oversized files", () => {
    expect(validateMediaFile({ mimeType: "image/jpeg", fileSize: MAX_PHOTO_UPLOAD_BYTES, kind: "photo" }).ok).toBe(true);
    expect(validateMediaFile({ mimeType: "image/jpeg", fileSize: MAX_PHOTO_UPLOAD_BYTES + 1, kind: "photo" }).ok).toBe(false);
    expect(validateMediaFile({
      mimeType: "image/jpeg",
      fileSize: 10,
      kind: "photo",
      fileName: "photo.png",
    }).ok).toBe(false);
    expect(hasAllowedMediaExtension("video.mov", "video/quicktime", "video")).toBe(true);
    expect(hasAllowedMediaExtension("video.webm", "video/mp4", "video")).toBe(false);
  });

  it("validates the final edited photo signature, MIME type, and size", () => {
    expect(validatePhotoPayload({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      mimeType: "image/jpeg",
      fileSize: 4,
    }).ok).toBe(true);
    expect(validatePhotoPayload({
      bytes: new Uint8Array([0x00, 0x01, 0x02]),
      mimeType: "image/jpeg",
      fileSize: 3,
    }).ok).toBe(false);
    expect(validatePhotoPayload({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/png",
      fileSize: 3,
    }).ok).toBe(false);
    expect(validatePhotoPayload({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
      fileSize: MAX_PHOTO_UPLOAD_BYTES + 1,
    }).ok).toBe(false);
  });

  it("rejects an upload that would exceed the event storage quota", () => {
    expect(canAcceptUpload({ quotaBytes: 100n, usedBytes: 80n }, 20n)).toBe(true);
    expect(canAcceptUpload({ quotaBytes: 100n, usedBytes: 80n }, 21n)).toBe(false);
  });

  it("creates photo metadata linked to the event and guest session as pending review", () => {
    const input = buildMemoryCreateInput({
      eventId: "event-id",
      guestSessionId: "session-id",
      storageKey: "events/event-id/photo.jpg",
      idempotencyKey: "c268c441-bf52-46cf-a19f-1cc707fc7bb2",
      type: "PHOTO",
      mimeType: "image/jpeg",
      fileSize: 12n,
      caption: "A lovely day",
    });
    expect(input.event).toEqual({ connect: { id: "event-id" } });
    expect(input.guestSession).toEqual({ connect: { id: "session-id" } });
    expect(input.mediaAssets?.create).toMatchObject({
      type: "PHOTO",
      moderationStatus: "PENDING",
      originalStorageKey: "events/event-id/photo.jpg",
    });
  });

  it("keeps the original and edited output in separate media storage fields", () => {
    const input = buildMemoryCreateInput({
      eventId: "event-id",
      guestSessionId: "session-id",
      storageKey: "events/event-id/source.jpg",
      optimizedStorageKey: "events/event-id/edited.jpg",
      idempotencyKey: "715dfd11-bb90-4a1f-a0d0-0183ceec6b8f",
      type: "PHOTO",
      mimeType: "image/jpeg",
      fileSize: 10n,
    });
    expect(input.mediaAssets?.create).toMatchObject({
      originalStorageKey: "events/event-id/source.jpg",
      optimizedStorageKey: "events/event-id/edited.jpg",
      moderationStatus: "PENDING",
      idempotencyKey: "715dfd11-bb90-4a1f-a0d0-0183ceec6b8f",
    });
  });

  it("creates video metadata with a verified duration and pending moderation", () => {
    const input = buildMemoryCreateInput({
      eventId: "event-id",
      guestSessionId: "session-id",
      storageKey: "events/event-id/video.mov",
      idempotencyKey: "58bfc2c0-3905-41a1-88f4-f19b445956e2",
      type: "VIDEO",
      mimeType: "video/quicktime",
      fileSize: 1024n,
      duration: 7.5,
    });

    expect(input.mediaAssets?.create).toMatchObject({
      type: "VIDEO",
      duration: 7.5,
      moderationStatus: "PENDING",
      originalStorageKey: "events/event-id/video.mov",
    });
  });
});

describe("Media Studio presets", () => {
  it("defines the six requested reusable filters", () => {
    expect(PHOTO_FILTERS.map((filter) => filter.name)).toEqual([
      "Original",
      "Warm",
      "Soft",
      "Vintage",
      "Film",
      "Black & White",
    ]);
  });

  it("defines reusable no-frame, editorial, and celebration frames", () => {
    expect(PHOTO_FRAMES.map((frame) => frame.name)).toEqual([
      "No Frame",
      "Minimal",
      "Polaroid",
      "Film Strip",
      "Wedding",
      "Celebration",
    ]);
    expect(new Set(PHOTO_FRAMES.map((frame) => frame.id)).size).toBe(PHOTO_FRAMES.length);
  });
});

describe("guest event access", () => {
  it("requires a guest session for public uploads and denies private guest access", () => {
    const publicEvent = { ownerId: "owner", privacyMode: "PUBLIC_LINK" as const };
    const privateEvent = { ownerId: "owner", privacyMode: "PRIVATE" as const };
    expect(canUploadToEvent(null, publicEvent, false)).toBe(false);
    expect(canUploadToEvent(null, publicEvent, true)).toBe(true);
    expect(canUploadToEvent(null, privateEvent, true)).toBe(false);
    expect(canUploadToEvent(null, { ownerId: "owner", privacyMode: "UPLOAD_ONLY" }, true)).toBe(true);
  });

  it("does not expose galleries for private or upload-only events", () => {
    const event = (privacyMode: "PUBLIC_LINK" | "MODERATED" | "PRIVATE" | "UPLOAD_ONLY") => ({
      privacyMode,
      status: "LIVE" as const,
      isPaid: true,
      expiresAt: null,
    });
    expect(canViewEventGallery(event("PUBLIC_LINK"))).toBe(true);
    expect(canViewEventGallery(event("MODERATED"))).toBe(true);
    expect(canViewEventGallery(event("PRIVATE"))).toBe(false);
    expect(canViewEventGallery(event("UPLOAD_ONLY"))).toBe(false);
  });

  it("blocks contributions by lifecycle status and expiration while retaining eligible galleries", () => {
    const now = new Date("2026-11-02T00:00:00.000Z");
    const event = {
      privacyMode: "MODERATED" as const,
      status: "LIVE" as const,
      isPaid: true,
      expiresAt: null as Date | null,
      startsAt: new Date("2026-11-01T00:00:00.000Z"),
      endsAt: new Date("2026-11-03T00:00:00.000Z"),
      timeZone: "UTC",
    };

    expect(canAcceptGuestContributions(event, now)).toBe(true);
    expect(getEffectiveGuestEventStatus(event, event.startsAt)).toBe("ONGOING");
    expect(getEffectiveGuestEventStatus(event, event.endsAt)).toBe("COMPLETED");
    expect(getEffectiveGuestEventStatus({
      ...event,
      startsAt: new Date(now.getTime() + 1),
    }, now)).toBe("UPCOMING");
    expect(canAccessGuestEventPage(event)).toBe(true);
    expect(canViewEventGallery(event)).toBe(true);
    expect(canAcceptGuestContributions({ ...event, isPaid: false }, now)).toBe(false);
    expect(canAccessGuestEventPage({ ...event, isPaid: false })).toBe(false);
    expect(canViewEventGallery({ ...event, isPaid: false })).toBe(false);

    for (const status of ["DRAFT", "COMPLETED", "ARCHIVED", "EXPIRED"] as const) {
      const closed = { ...event, status };
      expect(canAcceptGuestContributions(closed, now)).toBe(false);
    }

    expect(canAccessGuestEventPage({ ...event, status: "DRAFT" })).toBe(false);
    expect(canAccessGuestEventPage({ ...event, status: "ARCHIVED" })).toBe(false);
    expect(canViewEventGallery({ ...event, status: "COMPLETED" })).toBe(true);
    expect(canViewEventGallery({ ...event, status: "EXPIRED" })).toBe(true);
    expect(canAcceptGuestContributions({
      ...event,
      expiresAt: new Date(now.getTime() - 1),
    }, now)).toBe(false);
    expect(canAcceptGuestContributions({
      ...event,
      startsAt: new Date(now.getTime() + 1),
    }, now)).toBe(false);
    expect(canAcceptGuestContributions({
      ...event,
      endsAt: now,
    }, now)).toBe(false);
    expect(canAcceptGuestContributions({
      ...event,
      timeZone: "not/a-zone",
    }, now)).toBe(false);
    expect(isRetainedMediaAvailable(null, now)).toBe(true);
    expect(isRetainedMediaAvailable(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isRetainedMediaAvailable(new Date(now.getTime() + 1), now)).toBe(true);
  });

  it("builds and validates safe storage keys", () => {
    const key = buildStorageKey({
      eventId: "event-id",
      mediaId: "asset-id",
      kind: "video",
      variant: "original",
      suffix: ".mp4",
    });
    expect(key).toBe("events/event-id/videos/asset-id/original/.mp4");
    expect(isSafeStorageKey(key)).toBe(true);
    expect(isSafeStorageKey("events/../../secret")).toBe(false);
  });
});

describe("event moderation authorization", () => {
  const event = { ownerId: "organizer-a" };

  it("allows an organizer to moderate only their own event and allows admins", () => {
    expect(canModerateEvent({ id: "organizer-a", role: "ORGANIZER" }, event)).toBe(true);
    expect(canModerateEvent({ id: "organizer-b", role: "ORGANIZER" }, event)).toBe(false);
    expect(canModerateEvent({ id: "admin-1", role: "ADMIN" }, event)).toBe(true);
  });

  it("does not allow guests to moderate", () => {
    expect(canModerateEvent({ id: "guest-1", role: "GUEST" }, event)).toBe(false);
  });
});

describe("public moderation visibility", () => {
  it("shows approved memories and hides pending or rejected memories", () => {
    expect(isGalleryModerationVisible("APPROVED")).toBe(true);
    expect(isGalleryModerationVisible("PENDING")).toBe(false);
    expect(isGalleryModerationVisible("REJECTED")).toBe(false);
  });
});