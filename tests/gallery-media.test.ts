import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mediaAssetDeleteMany = vi.fn(async () => ({ count: 1 }));
  const mediaAssetCount = vi.fn(async () => 0);
  const memoryDeleteMany = vi.fn(async () => ({ count: 1 }));
  const transactionClient = {
    mediaAsset: { deleteMany: mediaAssetDeleteMany, count: mediaAssetCount },
    memory: { deleteMany: memoryDeleteMany },
  };
  return {
    findFirst: vi.fn(),
    getObject: vi.fn(),
    auth: vi.fn(),
    deleteObject: vi.fn(async () => undefined),
    mediaAssetDeleteMany,
    mediaAssetCount,
    memoryDeleteMany,
    transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient)),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    mediaAsset: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/services/storage", () => ({
  getStorageService: () => ({
    getObject: mocks.getObject,
    deleteObject: mocks.deleteObject,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { DELETE, GET } from "@/app/api/events/[slug]/media/[mediaId]/route";

describe("public gallery media delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "owner-1", role: "ORGANIZER" } });
    mocks.findFirst.mockResolvedValue({
      originalStorageKey: "events/event-1/photos/asset-1/original/.jpg",
      optimizedStorageKey: "events/event-1/photos/asset-1/edited/.jpg",
      mimeType: "image/jpeg",
      type: "PHOTO",
      expiresAt: null,
      event: { privacyMode: "MODERATED", status: "COMPLETED", expiresAt: null, orders: [{ id: "paid-order" }] },
    });
    mocks.getObject.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));
    mocks.mediaAssetDeleteMany.mockResolvedValue({ count: 1 });
    mocks.mediaAssetCount.mockResolvedValue(0);
  });

  it("serves approved, complete, unexpired media only within the requested event", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "event-one", mediaId: "asset-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "asset-1",
        event: expect.objectContaining({
          slug: "event-one",
          OR: expect.arrayContaining([
            { orders: { some: { status: "PAID" } } },
            { freeTrial: { isNot: null } },
          ]),
          privacyMode: { in: ["PUBLIC_LINK", "MODERATED"] },
          status: { in: ["UPCOMING", "LIVE", "COMPLETED", "EXPIRED"] },
        }),
        type: { in: ["PHOTO", "VIDEO"] },
        uploadStatus: "COMPLETE",
        moderationStatus: { in: ["APPROVED"] },
        OR: expect.arrayContaining([
          { expiresAt: null },
          { expiresAt: { gt: expect.any(Date) } },
        ]),
      }),
      select: expect.any(Object),
    });
    expect(mocks.getObject).toHaveBeenCalledWith(
      "events/event-1/photos/asset-1/edited/.jpg",
    );
  });

  it("does not deliver media when the event-bound approved lookup fails", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "another-event", mediaId: "asset-1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("adds an attachment header when a guest downloads gallery media", async () => {
    const response = await GET(new Request("http://localhost?download=1"), {
      params: Promise.resolve({ slug: "event-one", mediaId: "asset-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition"))
      .toBe('attachment; filename="ourlens-asset-1.jpeg"');
  });

  it("deletes stored media and its empty memory for the event owner", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "asset-1",
      eventId: "event-1",
      memoryId: "memory-1",
      originalStorageKey: "events/event-1/photos/asset-1/original/.jpg",
      optimizedStorageKey: "events/event-1/photos/asset-1/edited/.jpg",
      thumbnailStorageKey: null,
      event: { ownerId: "owner-1", privacyMode: "PUBLIC_LINK", accessGrants: [] },
    });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "event-one", mediaId: "asset-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(2);
    expect(mocks.mediaAssetDeleteMany).toHaveBeenCalledWith({
      where: { id: "asset-1", eventId: "event-1" },
    });
    expect(mocks.memoryDeleteMany).toHaveBeenCalledWith({ where: { id: "memory-1" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/e/event-one");
  });

  it("does not delete media for a user who cannot manage the event", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "other-user", role: "ORGANIZER" } });
    mocks.findFirst.mockResolvedValue({
      id: "asset-1",
      eventId: "event-1",
      memoryId: "memory-1",
      originalStorageKey: "original.jpg",
      optimizedStorageKey: null,
      thumbnailStorageKey: null,
      event: { ownerId: "owner-1", privacyMode: "PUBLIC_LINK", accessGrants: [] },
    });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "event-one", mediaId: "asset-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not allow a viewer grant to delete gallery media", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "viewer-1", role: "ORGANIZER" } });
    mocks.findFirst.mockResolvedValue({
      id: "asset-1",
      eventId: "event-1",
      memoryId: "memory-1",
      originalStorageKey: "original.jpg",
      optimizedStorageKey: null,
      thumbnailStorageKey: null,
      event: {
        ownerId: "owner-1",
        privacyMode: "PUBLIC_LINK",
        accessGrants: [{ userId: "viewer-1", role: "VIEWER" }],
      },
    });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "event-one", mediaId: "asset-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
