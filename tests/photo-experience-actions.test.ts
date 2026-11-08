import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    event: { findFirst: mocks.findFirst },
    photoExperience: { upsert: mocks.upsert },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { savePhotoExperienceAction } from "@/features/events/photo-experience-actions";

function formData(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("eventId", "event-1");
  form.set("filter", "DISPOSABLE_CAM");
  form.set("frame", "POLAROID_WHITE");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("photo experience authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not allow a guest to change event photo settings", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "guest-1", role: "GUEST" } });

    const result = await savePhotoExperienceAction({}, formData());

    expect(result.error).toContain("Masuk");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("only updates events owned by the signed-in organizer", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "organizer-2", role: "ORGANIZER" } });
    mocks.findFirst.mockResolvedValue(null);

    const result = await savePhotoExperienceAction({}, formData());

    expect(result.error).toContain("izin");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "event-1", ownerId: "organizer-2" },
      select: { id: true, slug: true },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("persists only supported filter and frame values for an owned event", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "organizer-1", role: "ORGANIZER" } });
    mocks.findFirst.mockResolvedValue({ id: "event-1", slug: "audreys-party" });
    mocks.upsert.mockResolvedValue({});

    const result = await savePhotoExperienceAction({}, formData());

    expect(result.success).toBe("Pengaturan tampilan foto berhasil disimpan.");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      create: { eventId: "event-1", filter: "DISPOSABLE_CAM", frame: "POLAROID_WHITE" },
      update: { filter: "DISPOSABLE_CAM", frame: "POLAROID_WHITE" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/e/audreys-party");
  });

  it("rejects unsupported values before accessing the database", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "organizer-1", role: "ORGANIZER" } });

    const result = await savePhotoExperienceAction({}, formData({ filter: "CUSTOM" }));

    expect(result.error).toContain("valid");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
