import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: authState.userId, role: "ORGANIZER" },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

import { createGuestToken, hashGuestToken } from "@/lib/guest-token";
import { prisma } from "@/server/db/prisma";
import { createPackageSnapshot } from "@/server/packages/snapshot";
import { getOrganizerOrder } from "@/server/orders/queries";
import { getStorageService } from "@/services/storage";
import { moderateMemoryAction } from "@/features/moderation/actions";
import { POST as createGuestSession } from "@/app/api/events/[slug]/guest-session/route";
import { GET as getPublicMedia } from "@/app/api/events/[slug]/media/[mediaId]/route";
import { POST as uploadMemory } from "@/app/api/events/[slug]/memories/route";
import {
  createEventAction,
  updateEventScheduleAction,
} from "@/features/events/actions";
import { GET as getEventQr } from "@/app/api/events/[slug]/qr/route";

process.env.STORAGE_PROVIDER = "local";

const databaseAvailable = Boolean(process.env.DATABASE_URL);

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set([...type].map((character) => character.charCodeAt(0)), 4);
  bytes.set(payload, 8);
  return bytes;
}

function mp4WithDuration(seconds: number): Uint8Array {
  const ascii = (value: string) => new Uint8Array([...value].map((character) => character.charCodeAt(0)));
  const header = (type: "mvhd" | "mdhd") => {
    const body = new Uint8Array(20);
    const view = new DataView(body.buffer);
    view.setUint32(12, 1000);
    view.setUint32(16, seconds * 1000);
    return box(type, body);
  };
  const handlerBody = new Uint8Array(12);
  handlerBody.set(ascii("vide"), 8);
  const mdia = box("mdia", new Uint8Array([
    ...box("hdlr", handlerBody),
    ...header("mdhd"),
  ]));
  const trak = box("trak", mdia);
  const moov = box("moov", new Uint8Array([...header("mvhd"), ...trak]));
  const fileType = box("ftyp", new Uint8Array([...ascii("isom"), 0, 0, 0, 0, ...ascii("isom")]));
  return new Uint8Array([...fileType, ...moov]);
}

describe.skipIf(!databaseAvailable)("PostgreSQL guest upload integration", () => {
  const suffix = crypto.randomUUID();
  const slug = `phase1-${suffix}`;
  const createdEventIds: string[] = [];
  let eventId = "";
  let ownerId = "";
  let packageId = "";
  let token = "";
  const extraEventIds: string[] = [];
  const createdOrderIds: string[] = [];

  async function attachPaidOrder(targetEventId: string) {
    const packageRecord = await prisma.package.findUniqueOrThrow({ where: { id: packageId } });
    const order = await prisma.order.create({
      data: {
        orderNumber: `OL-${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
        userId: ownerId,
        packageId,
        eventId: targetEventId,
        packageSnapshot: createPackageSnapshot(packageRecord),
        status: "PAID",
        amount: packageRecord.price,
        currency: packageRecord.currency,
        payments: {
          create: {
            provider: "MIDTRANS",
            providerRef: `test-${crypto.randomUUID()}`,
            status: "PAID",
            amount: packageRecord.price,
          },
        },
      },
      select: { id: true },
    });
    createdOrderIds.push(order.id);
  }

  async function clearUploadedMedia() {
    if (!eventId) return;
    const assets = await prisma.mediaAsset.findMany({
      where: { eventId },
      select: { originalStorageKey: true, optimizedStorageKey: true },
    });
    const storage = getStorageService();
    for (const asset of assets) {
      await storage.deleteObject(asset.originalStorageKey);
      if (asset.optimizedStorageKey) await storage.deleteObject(asset.optimizedStorageKey);
    }
    await prisma.memory.deleteMany({ where: { eventId } });
    await prisma.mediaAsset.deleteMany({ where: { eventId } });
    await prisma.storageUsage.update({
      where: { eventId },
      data: {
        quotaBytes: 1024n * 1024n,
        usedBytes: 0n,
        photoBytes: 0n,
        videoBytes: 0n,
      },
    });
    await prisma.event.update({
      where: { id: eventId },
      data: {
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        timeZone: "Asia/Jakarta",
        expiresAt: null,
      },
    });
  }

  async function postUpload(input: {
    kind: "photo" | "video";
    bytes: Uint8Array;
    mimeType: string;
    idempotencyKey?: string;
    requestSlug?: string;
    requestToken?: string;
  }) {
    const key = input.idempotencyKey ?? crypto.randomUUID();
    const requestSlug = input.requestSlug ?? slug;
    const requestToken = input.requestToken ?? token;
    const buffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(buffer).set(input.bytes);
    const form = new FormData();
    form.set("kind", input.kind);
    form.set(input.kind, new File(
      [buffer],
      input.kind === "photo" ? "memory.jpg" : "memory.mp4",
      { type: input.mimeType },
    ));
    form.set("idempotencyKey", key);
    const request = new Request(`http://localhost/api/events/${requestSlug}/memories`, {
      method: "POST",
      headers: {
        origin: "http://localhost",
        cookie: `ourlens_guest_${requestSlug}=${requestToken}`,
      },
      body: form,
    });
    return uploadMemory(request, { params: Promise.resolve({ slug: requestSlug }) });
  }

  beforeAll(async () => {
    if (!databaseAvailable) return;
    await prisma.$connect();
    const owner = await prisma.user.create({
      data: { email: `${suffix}@phase1.test`, name: "Phase 1 integration", role: "ORGANIZER" },
      select: { id: true },
    });
    ownerId = owner.id;
    const packageRecord = await prisma.package.create({
      data: {
        name: `Phase 1 ${suffix}`,
        price: 25000,
        storageLimitBytes: 1024n * 1024n,
        photoLimit: 20,
        videoLimit: 5,
        videoDurationLimit: 15,
        eventDurationDays: 2,
        retentionDays: 30,
        isActive: true,
      },
      select: { id: true },
    });
    packageId = packageRecord.id;
    const event = await prisma.event.create({
      data: {
        ownerId,
        packageId,
        name: "Phase 1 integration event",
        slug,
        status: "LIVE",
        privacyMode: "MODERATED",
        eventDate: new Date("2026-11-02T12:00:00.000Z"),
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        timeZone: "Asia/Jakarta",
        storageUsage: { create: { quotaBytes: 1024n * 1024n } },
      },
      select: { id: true },
    });
    eventId = event.id;
    await attachPaidOrder(eventId);
    token = createGuestToken();
    const guest = await prisma.guestSession.create({
      data: {
        eventId,
        tokenHash: hashGuestToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
      select: { id: true },
    });
    expect(guest.id).toBeTruthy();
  });

  afterEach(clearUploadedMedia);

  afterAll(async () => {
    if (!databaseAvailable) return;
    await clearUploadedMedia();
    if (createdOrderIds.length) {
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    if (extraEventIds.length) {
      await prisma.event.deleteMany({ where: { id: { in: extraEventIds } } });
    }
    if (createdEventIds.length) {
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (packageId) await prisma.package.deleteMany({ where: { id: packageId } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("writes a photo to PostgreSQL, keeps it pending, and serves it only after approval", async () => {
    const response = await postUpload({
      kind: "photo",
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
    });
    expect(response.status).toBe(201);

    const asset = await prisma.mediaAsset.findFirstOrThrow({ where: { eventId } });
    expect(asset).toMatchObject({
      type: "PHOTO",
      uploadStatus: "COMPLETE",
      moderationStatus: "PENDING",
    });
    expect(asset.memoryId).toBeTruthy();
    const pending = await getPublicMedia(new Request("http://localhost"), {
      params: Promise.resolve({ slug, mediaId: asset.id }),
    });
    expect(pending.status).toBe(404);
    authState.userId = ownerId;
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("mediaAssetId", asset.id);
    formData.set("decision", "APPROVED");
    const approval = await moderateMemoryAction({}, formData);
    expect(approval.success).toBe("Memory approved.");

    const approved = await getPublicMedia(new Request("http://localhost"), {
      params: Promise.resolve({ slug, mediaId: asset.id }),
    });
    expect(approved.status).toBe(200);
  });

  it("stores real video metadata and updates only the video quota counter", async () => {
    const video = mp4WithDuration(8);
    const response = await postUpload({
      kind: "video",
      bytes: video,
      mimeType: "video/mp4",
    });
    expect(response.status).toBe(201);

    const asset = await prisma.mediaAsset.findFirstOrThrow({ where: { eventId } });
    const usage = await prisma.storageUsage.findUniqueOrThrow({ where: { eventId } });
    expect(asset.type).toBe("VIDEO");
    expect(asset.duration).toBe(8);
    expect(asset.moderationStatus).toBe("PENDING");
    expect(usage.videoBytes).toBe(BigInt(video.length));
    expect(usage.photoBytes).toBe(0n);
    const pending = await getPublicMedia(new Request("http://localhost"), {
      params: Promise.resolve({ slug, mediaId: asset.id }),
    });
    expect(pending.status).toBe(404);
    authState.userId = ownerId;
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("mediaAssetId", asset.id);
    formData.set("decision", "APPROVED");
    expect((await moderateMemoryAction({}, formData)).success).toBe("Memory approved.");
    const approved = await getPublicMedia(new Request("http://localhost"), {
      params: Promise.resolve({ slug, mediaId: asset.id }),
    });
    expect(approved.status).toBe(200);
    expect(approved.headers.get("content-type")).toBe("video/mp4");
  });

  it("serializes concurrent quota reservations and persists idempotent retry results", async () => {
    await prisma.storageUsage.update({
      where: { eventId },
      data: { quotaBytes: 3n },
    });
    const requests = await Promise.all([
      postUpload({ kind: "photo", bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }),
      postUpload({ kind: "photo", bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }),
    ]);
    expect(requests.map((response) => response.status).sort()).toEqual([201, 413]);
    expect(await prisma.mediaAsset.count({ where: { eventId } })).toBe(1);

    await clearUploadedMedia();
    await prisma.storageUsage.update({
      where: { eventId },
      data: { quotaBytes: 1024n * 1024n },
    });
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      kind: "photo" as const,
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
      idempotencyKey,
    };
    expect((await postUpload(payload)).status).toBe(201);
    expect((await postUpload(payload)).status).toBe(200);
    expect(await prisma.mediaAsset.count({ where: { eventId } })).toBe(1);
  });

  it("rejects a guest session from another event and an event before its start", async () => {
    const otherEvent = await prisma.event.create({
      data: {
        ownerId,
        packageId,
        name: "Other Phase 1 integration event",
        slug: `${slug}-other`,
        status: "LIVE",
        privacyMode: "MODERATED",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        timeZone: "Asia/Jakarta",
        storageUsage: { create: { quotaBytes: 1024n * 1024n } },
      },
      select: { id: true },
    });
    extraEventIds.push(otherEvent.id);
    await attachPaidOrder(otherEvent.id);
    const otherToken = createGuestToken();
    await prisma.guestSession.create({
      data: {
        eventId: otherEvent.id,
        tokenHash: hashGuestToken(otherToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const crossEventResponse = await postUpload({
      kind: "photo",
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
      requestToken: otherToken,
    });
    expect(crossEventResponse.status).toBe(401);

    await prisma.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() + 60_000) },
    });
    const upcomingResponse = await postUpload({
      kind: "photo",
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
    });
    expect(upcomingResponse.status).toBe(404);
    await prisma.event.delete({ where: { id: otherEvent.id } });
  });

  it("creates an event-bound guest session only while the event schedule is open", async () => {
    const activeResponse = await createGuestSession(
      new Request(`http://localhost/api/events/${slug}/guest-session`, {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(activeResponse.status).toBe(200);
    expect(activeResponse.headers.get("set-cookie")).toContain(`ourlens_guest_${slug}=`);
    expect(await prisma.guestSession.count({ where: { eventId } })).toBe(2);

    await prisma.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() + 60_000) },
    });
    const upcomingResponse = await createGuestSession(
      new Request(`http://localhost/api/events/${slug}/guest-session`, {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(upcomingResponse.status).toBe(404);
    expect(await prisma.guestSession.count({ where: { eventId } })).toBe(2);
  });

  it("creates an unpaid event order with its package snapshot and downloadable QR", async () => {
    authState.userId = ownerId;
    const formData = new FormData();
    formData.set("name", `Phase 1 Created Event ${suffix}`);
    formData.set("eventType", "WEDDING");
    formData.set("eventDate", "2027-06-12");
    formData.set("startTime", "17:00");
    formData.set("endDate", "2027-06-12");
    formData.set("endTime", "23:00");
    formData.set("timeZone", "Asia/Jakarta");
    formData.set("privacyMode", "PUBLIC_LINK");
    formData.set("packageId", packageId);
    const idempotencyKey = crypto.randomUUID();
    formData.set("idempotencyKey", idempotencyKey);

    const submit = async () => {
      try {
        await createEventAction({}, formData);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("NEXT_REDIRECT:")) throw error;
        return error.message.slice("NEXT_REDIRECT:".length);
      }
      throw new Error("Event creation did not redirect to its order.");
    };
    const [redirectPath, duplicateRedirectPath] = await Promise.all([submit(), submit()]);
    expect(duplicateRedirectPath).toBe(redirectPath);
    expect(redirectPath).toMatch(/^\/dashboard\/transactions\/.+\?created=1$/);
    const orderId = redirectPath.match(/^\/dashboard\/transactions\/([^?]+)/)?.[1];
    expect(orderId).toBeTruthy();
    if (orderId) createdOrderIds.push(orderId);

    const createdEvent = await prisma.event.findFirstOrThrow({
      where: { ownerId, name: `Phase 1 Created Event ${suffix}` },
      include: { qrCode: true, storageUsage: true },
    });
    createdEventIds.push(createdEvent.id);
    expect(createdEvent.status).toBe("DRAFT");
    expect(createdEvent.startsAt?.toISOString()).toBe("2027-06-12T10:00:00.000Z");
    expect(createdEvent.timeZone).toBe("Asia/Jakarta");
    expect(createdEvent.qrCode?.destinationUrl).toContain(`/e/${createdEvent.slug}`);
    expect(createdEvent.storageUsage).toBeNull();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({ status: "PENDING", idempotencyKey, currency: "IDR" });
    expect(order.packageSnapshot).toMatchObject({ name: expect.any(String), price: "25000" });
    expect(await prisma.order.count({ where: { idempotencyKey } })).toBe(1);
    expect(await getOrganizerOrder(order.id, "not-the-owner")).toBeNull();
    const originalPackage = await prisma.package.findUniqueOrThrow({ where: { id: packageId } });
    try {
      await prisma.package.update({ where: { id: packageId }, data: { price: 0 } });
      expect(await submit()).toBe(redirectPath);
      expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).amount))
        .toBe(Number(originalPackage.price));
    } finally {
      await prisma.package.update({
        where: { id: packageId },
        data: { price: originalPackage.price },
      });
    }

    const qrResponse = await getEventQr(new Request("http://localhost"), {
      params: Promise.resolve({ slug: createdEvent.slug }),
    });
    expect(qrResponse.status).toBe(200);
    expect(qrResponse.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await qrResponse.arrayBuffer()).slice(0, 8))
      .toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

    const scheduleForm = new FormData();
    scheduleForm.set("eventId", createdEvent.id);
    scheduleForm.set("eventDate", "2027-06-13");
    scheduleForm.set("startTime", "18:00");
    scheduleForm.set("endDate", "2027-06-13");
    scheduleForm.set("endTime", "23:00");
    scheduleForm.set("timeZone", "Asia/Jakarta");
    expect((await updateEventScheduleAction({}, scheduleForm)).success)
      .toBe("Event schedule updated.");
    const updatedEvent = await prisma.event.findUniqueOrThrow({ where: { id: createdEvent.id } });
    expect(updatedEvent.startsAt?.toISOString()).toBe("2027-06-13T11:00:00.000Z");
  });
});
