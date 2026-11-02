import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { mediaAsset: { findFirst: mocks.findFirst } },
}));
vi.mock("@/services/storage", () => ({
  getStorageService: () => ({ getObject: mocks.getObject }),
}));

import { GET } from "@/app/api/events/[slug]/media/[mediaId]/route";

describe("public gallery media delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      originalStorageKey: "events/event-1/photos/asset-1/original/.jpg",
      optimizedStorageKey: "events/event-1/photos/asset-1/edited/.jpg",
      mimeType: "image/jpeg",
      type: "PHOTO",
      expiresAt: null,
      event: { privacyMode: "MODERATED", status: "COMPLETED", expiresAt: null, orders: [{ id: "paid-order" }] },
    });
    mocks.getObject.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));
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
          orders: { some: { status: "PAID" } },
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
});
