import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    event: {
      id: "event-1",
      privacyMode: "MODERATED",
      status: "LIVE",
      expiresAt: null as Date | null,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      timeZone: "UTC",
      orders: [{ id: "paid-order" }],
      package: {
        retentionDays: 30,
        photoLimit: 10,
        videoLimit: 5,
        videoDurationLimit: 10,
      },
      storageUsage: { id: "usage-1" },
    },
    usage: {
      quotaBytes: 1024n,
      usedBytes: 0n,
      photoBytes: 0n,
      videoBytes: 0n,
    },
    sessions: new Map<string, { id: string; eventId: string; expiresAt: Date }>(),
    assets: [] as Array<Record<string, unknown>>,
    memories: [] as Array<Record<string, unknown>>,
    stored: new Map<string, Uint8Array>(),
    queue: Promise.resolve(),
  };

  const storage = {
    putObject: vi.fn(async ({ key, body }: { key: string; body: Uint8Array }) => {
      state.stored.set(key, new Uint8Array(body));
    }),
    getObject: vi.fn(),
    getSignedUploadUrl: vi.fn(),
    getSignedDownloadUrl: vi.fn(),
    deleteObject: vi.fn(async (key: string) => {
      state.stored.delete(key);
    }),
  };

  const prisma = {
    event: {
      findUnique: vi.fn(async () => state.event),
    },
    guestSession: {
      findFirst: vi.fn(async ({ where }: { where: { eventId: string; tokenHash: string } }) => {
        const session = state.sessions.get(where.tokenHash);
        return session?.eventId === where.eventId ? { id: session.id } : null;
      }),
    },
    challenge: {
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => {
      let release = () => {};
      const previous = state.queue;
      state.queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      const previousUsage = { ...state.usage };
      const previousAssets = [...state.assets];
      const previousMemories = [...state.memories];
      const transaction = {
        $queryRaw: vi.fn(async (query: { sql: string }) =>
          query.sql.includes("FOR SHARE") ? [{ id: state.event.id }] : [],
        ),
        $executeRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => {
          const requestedBytes = query.values.find((value): value is bigint => typeof value === "bigint") ?? 0n;
          if (state.usage.quotaBytes - state.usage.usedBytes < requestedBytes) return 0;
          state.usage.usedBytes += requestedBytes;
          if (query.sql.includes('"photoBytes"')) state.usage.photoBytes += requestedBytes;
          if (query.sql.includes('"videoBytes"')) state.usage.videoBytes += requestedBytes;
          return 1;
        }),
        mediaAsset: {
          findUnique: vi.fn(async ({ where }: { where: { eventId_idempotencyKey: { eventId: string; idempotencyKey: string } } }) => {
            const { eventId, idempotencyKey } = where.eventId_idempotencyKey;
            return state.assets.find((asset) =>
              asset.eventId === eventId && asset.idempotencyKey === idempotencyKey
            ) ?? null;
          }),
          count: vi.fn(async ({ where }: { where: { eventId: string; type: string } }) =>
            state.assets.filter((asset) =>
              asset.eventId === where.eventId && asset.type === where.type
            ).length
          ),
        },
        event: {
          findUnique: vi.fn(async () => state.event),
        },
        memory: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const created = data.mediaAssets as { create: Record<string, unknown> };
            const asset = {
              ...created.create,
              eventId: state.event.id,
              id: `asset-${state.assets.length + 1}`,
            };
            state.assets.push(asset);
            state.memories.push(data);
            return { id: `memory-${state.memories.length}` };
          }),
        },
        challengeSubmission: { create: vi.fn(async () => ({})) },
      };

      try {
        return await callback(transaction);
      } catch (error) {
        state.usage = previousUsage;
        state.assets = previousAssets;
        state.memories = previousMemories;
        throw error;
      } finally {
        release();
      }
    }),
  };

  return { state, storage, prisma };
});

vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/services/storage", () => ({ getStorageService: () => mocks.storage }));

import { POST } from "@/app/api/events/[slug]/memories/route";
import { createGuestToken, hashGuestToken } from "@/lib/guest-token";
import { resetRateLimits } from "@/lib/rate-limit";

const slug = "test-event";

afterEach(() => {
  vi.restoreAllMocks();
});

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function ascii(value: string): Uint8Array {
  return new Uint8Array([...value].map((character) => character.charCodeAt(0)));
}

function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, header.length + payload.length);
  header.set(ascii(type), 4);
  return concat(header, payload);
}

function mediaHeader(type: "mvhd" | "mdhd", durationSeconds: number): Uint8Array {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint32(12, 1000);
  view.setUint32(16, durationSeconds * 1000);
  return mp4Box(type, payload);
}

function videoHandler(): Uint8Array {
  const payload = new Uint8Array(12);
  payload.set(ascii("vide"), 8);
  return mp4Box("hdlr", payload);
}

function testMp4(durationSeconds: number): Uint8Array {
  const ftypPayload = concat(ascii("isom"), bytes(0, 0, 0, 0), ascii("isom"));
  const ftyp = mp4Box("ftyp", ftypPayload);
  const mdia = mp4Box("mdia", concat(videoHandler(), mediaHeader("mdhd", durationSeconds)));
  const trak = mp4Box("trak", mdia);
  const moov = mp4Box("moov", concat(mediaHeader("mvhd", durationSeconds), trak));
  return concat(ftyp, moov);
}

function makeRequest(input: {
  kind: "photo" | "video";
  media: Uint8Array;
  mimeType: string;
  idempotencyKey?: string;
  original?: Uint8Array;
  originalMimeType?: string;
  token?: string;
  sessionEventId?: string;
}) {
  const token = input.token ?? createGuestToken();
  mocks.state.sessions.set(hashGuestToken(token), {
    id: "guest-session-1",
    eventId: input.sessionEventId ?? mocks.state.event.id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const form = new FormData();
  form.set("kind", input.kind);
  form.set(
    input.kind,
    new File([toArrayBuffer(input.media)], input.kind === "photo" ? "memory.jpg" : "memory.mp4", {
      type: input.mimeType,
    }),
  );
  form.set("idempotencyKey", input.idempotencyKey ?? crypto.randomUUID());
  if (input.original) {
    form.set(
      "original",
      new File([toArrayBuffer(input.original)], "original.jpg", {
        type: input.originalMimeType ?? input.mimeType,
      }),
    );
  }
  const request = new Request(`http://localhost/api/events/${slug}/memories`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      cookie: `ourlens_guest_${slug}=${token}`,
    },
    body: form,
  });
  return { request, token };
}

async function post(input: Parameters<typeof makeRequest>[0]) {
  const { request } = makeRequest(input);
  return POST(request, { params: Promise.resolve({ slug }) });
}

describe("guest media upload API", () => {
  beforeEach(() => {
    Object.assign(mocks.state.event, {
      id: "event-1",
      privacyMode: "MODERATED",
      status: "LIVE",
      expiresAt: null,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      timeZone: "UTC",
      orders: [{ id: "paid-order" }],
      package: {
        retentionDays: 30,
        photoLimit: 10,
        videoLimit: 5,
        videoDurationLimit: 10,
      },
      storageUsage: { id: "usage-1" },
    });
    mocks.state.usage.quotaBytes = 1024n;
    mocks.state.usage.usedBytes = 0n;
    mocks.state.usage.photoBytes = 0n;
    mocks.state.usage.videoBytes = 0n;
    mocks.state.sessions.clear();
    mocks.state.assets = [];
    mocks.state.memories = [];
    mocks.state.stored.clear();
    mocks.state.queue = Promise.resolve();
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("persists an approved-flow photo as pending with original and edited variants", async () => {
    const response = await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff, 0x00, 0x01),
      mimeType: "image/jpeg",
      original: bytes(0xff, 0xd8, 0xff, 0x02),
    });

    expect(response.status).toBe(201);
    expect(mocks.state.assets).toHaveLength(1);
    expect(mocks.state.assets[0]).toMatchObject({
      type: "PHOTO",
      uploadStatus: "COMPLETE",
      moderationStatus: "PENDING",
      mimeType: "image/jpeg",
    });
    expect(mocks.state.assets[0]).toMatchObject({
      originalStorageKey: expect.any(String),
      optimizedStorageKey: expect.any(String),
    });
    expect(mocks.state.memories[0]).toMatchObject({
      event: { connect: { id: "event-1" } },
      guestSession: { connect: { id: "guest-session-1" } },
      caption: null,
    });
    expect(mocks.state.stored.size).toBe(2);
    expect(mocks.state.usage.photoBytes).toBe(9n);
    expect(mocks.state.usage.videoBytes).toBe(0n);
  });

  it("rejects invalid photo signatures and oversized photo inputs", async () => {
    const wrongSignature = await post({
      kind: "photo",
      media: bytes(0, 1, 2, 3),
      mimeType: "image/jpeg",
    });
    expect(wrongSignature.status).toBe(400);

    const oversized = await post({
      kind: "photo",
      media: new Uint8Array(8 * 1024 * 1024 + 1),
      mimeType: "image/jpeg",
    });
    expect(oversized.status).toBe(413);
    expect(mocks.state.assets).toHaveLength(0);
  });

  it("removes partially written files and rolls back quota when storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.storage.putObject.mockImplementationOnce(async ({ key, body }) => {
      mocks.state.stored.set(key, new Uint8Array(body));
      throw new Error("storage write failed");
    });

    const response = await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
      original: bytes(0xff, 0xd8, 0xff),
    });

    expect(response.status).toBe(500);
    expect(mocks.state.assets).toHaveLength(0);
    expect(mocks.state.stored.size).toBe(0);
    expect(mocks.state.usage.usedBytes).toBe(0n);
    expect(mocks.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("cleans up an upload if the event closes while storage is being written", async () => {
    mocks.storage.putObject.mockImplementationOnce(async ({ key, body }) => {
      mocks.state.stored.set(key, new Uint8Array(body));
      mocks.state.event.endsAt = new Date(Date.now() - 1);
    });

    const response = await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
    });

    expect(response.status).toBe(404);
    expect(mocks.state.assets).toHaveLength(0);
    expect(mocks.state.stored.size).toBe(0);
    expect(mocks.state.usage.usedBytes).toBe(0n);
    expect(mocks.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("rejects a guest session associated with a different event", async () => {
    const token = createGuestToken();
    mocks.state.sessions.set(hashGuestToken(token), {
      id: "other-event-session",
      eventId: "event-2",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { request } = makeRequest({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
      token,
      sessionEventId: "event-2",
    });

    expect((await POST(request, { params: Promise.resolve({ slug }) })).status).toBe(401);
    expect(mocks.storage.putObject).not.toHaveBeenCalled();
  });

  it("rejects exhausted photo quota and prevents concurrent quota oversubscription", async () => {
    mocks.state.event.package!.photoLimit = 0;
    const exhausted = await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
    });
    expect(exhausted.status).toBe(413);
    expect(mocks.state.assets).toHaveLength(0);

    mocks.state.event.package!.photoLimit = 10;
    mocks.state.usage.quotaBytes = 100n;
    const first = makeRequest({
      kind: "photo",
      media: new Uint8Array(40).map((_, index) => index === 0 ? 0xff : index === 1 ? 0xd8 : index === 2 ? 0xff : 0),
      mimeType: "image/jpeg",
      original: new Uint8Array(40).map((_, index) => index === 0 ? 0xff : index === 1 ? 0xd8 : index === 2 ? 0xff : 0),
    });
    const second = makeRequest({
      kind: "photo",
      media: new Uint8Array(40).map((_, index) => index === 0 ? 0xff : index === 1 ? 0xd8 : index === 2 ? 0xff : 0),
      mimeType: "image/jpeg",
      original: new Uint8Array(40).map((_, index) => index === 0 ? 0xff : index === 1 ? 0xd8 : index === 2 ? 0xff : 0),
    });
    const responses = await Promise.all([
      POST(first.request, { params: Promise.resolve({ slug }) }),
      POST(second.request, { params: Promise.resolve({ slug }) }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 413]);
    expect(mocks.state.assets).toHaveLength(1);
    expect(mocks.state.usage.usedBytes).toBe(80n);
    expect(mocks.state.stored.size).toBe(2);
  });

  it("stores Live Moment as VIDEO and increments video storage usage", async () => {
    const response = await post({
      kind: "video",
      media: testMp4(5),
      mimeType: "video/mp4",
    });

    expect(response.status).toBe(201);
    expect(mocks.state.assets[0]).toMatchObject({
      type: "VIDEO",
      moderationStatus: "PENDING",
      duration: 5,
      optimizedStorageKey: undefined,
    });
    expect(mocks.state.usage.videoBytes).toBe(BigInt(testMp4(5).length));
    expect(mocks.state.usage.photoBytes).toBe(0n);
  });

  it("enforces the video count limit independently from the photo limit", async () => {
    mocks.state.event.package!.videoLimit = 0;
    mocks.state.event.package!.photoLimit = 10;

    const response = await post({
      kind: "video",
      media: testMp4(5),
      mimeType: "video/mp4",
    });

    expect(response.status).toBe(413);
    expect(mocks.state.assets).toHaveLength(0);
    expect(mocks.state.stored.size).toBe(0);
    expect(mocks.state.usage.photoBytes).toBe(0n);
    expect(mocks.state.usage.videoBytes).toBe(0n);
  });

  it("rejects video duration above the package limit and duration metadata it cannot verify", async () => {
    const tooLong = await post({
      kind: "video",
      media: testMp4(11),
      mimeType: "video/mp4",
    });
    const unknownDuration = await post({
      kind: "video",
      media: concat(
        mp4Box("ftyp", concat(ascii("isom"), bytes(0, 0, 0, 0), ascii("isom"))),
        mp4Box("mdat", bytes(1, 2, 3)),
      ),
      mimeType: "video/mp4",
    });

    expect(tooLong.status).toBe(400);
    expect(unknownDuration.status).toBe(400);
    expect(mocks.state.assets).toHaveLength(0);
  });

  it("does not accept uploads for draft, completed, archived, expired, or time-expired events", async () => {
    for (const status of ["DRAFT", "COMPLETED", "ARCHIVED", "EXPIRED"]) {
      mocks.state.event.status = status;
      const response = await post({
        kind: "photo",
        media: bytes(0xff, 0xd8, 0xff),
        mimeType: "image/jpeg",
      });
      expect(response.status, status).toBe(404);
    }

    mocks.state.event.status = "LIVE";
    mocks.state.event.startsAt = new Date(Date.now() - 60_000);
    mocks.state.event.endsAt = new Date(Date.now() + 60_000);
    mocks.state.event.expiresAt = new Date(Date.now() - 1000);
    expect((await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
    })).status).toBe(404);
    expect(mocks.state.assets).toHaveLength(0);
  });

  it("rejects UPCOMING and invalid schedules before issuing uploads", async () => {
    mocks.state.event.startsAt = new Date(Date.now() + 60_000);
    const upcoming = await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
    });
    expect(upcoming.status).toBe(404);

    mocks.state.event.startsAt = new Date(Date.now() - 60_000);
    mocks.state.event.timeZone = "not/a-zone";
    const invalidTimeZone = await post({
      kind: "photo",
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
    });
    expect(invalidTimeZone.status).toBe(404);
    expect(mocks.state.assets).toHaveLength(0);
    expect(mocks.state.stored.size).toBe(0);
  });

  it("treats a repeated idempotency key as a successful retry without storing duplicates", async () => {
    const idempotencyKey = crypto.randomUUID();
    const input = {
      kind: "photo" as const,
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
      idempotencyKey,
    };

    expect((await post(input)).status).toBe(201);
    expect((await post(input)).status).toBe(200);
    expect(mocks.state.assets).toHaveLength(1);
    expect(mocks.storage.putObject).toHaveBeenCalledTimes(1);
  });

  it("applies the upload rate limit to the guest session", async () => {
    const input = {
      kind: "photo" as const,
      media: bytes(0xff, 0xd8, 0xff),
      mimeType: "image/jpeg",
      idempotencyKey: crypto.randomUUID(),
      token: createGuestToken(),
    };
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await post(input));
    }

    expect(responses[9].status).toBe(200);
    expect(responses[10].status).toBe(429);
    expect(responses[10].headers.get("retry-after")).toBeTruthy();
  });
});
