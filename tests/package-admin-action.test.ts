import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  updateMany: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db/prisma", () => ({
  prisma: { package: { updateMany: mocks.updateMany } },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { updatePackagePriceAction } from "@/features/packages/admin-actions";

function makeFormData(packageId = "package-1", price = "79000") {
  const formData = new FormData();
  formData.set("packageId", packageId);
  formData.set("price", price);
  return formData;
}

function redirectError() {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
}

describe("admin package price action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw redirectError();
    });
  });

  it("only lets admins update an existing package price", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "organizer-1", role: "ORGANIZER" } });

    await expect(updatePackagePriceAction(makeFormData())).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("persists an admin price update and refreshes all package price surfaces", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(updatePackagePriceAction(makeFormData("package-5", "129000")))
      .rejects.toMatchObject({ digest: "NEXT_REDIRECT" });

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    const update = mocks.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "package-5" });
    expect(update.data.price.toString()).toBe("129000");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pricing");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/events/create");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/partner/orders/new");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/package-pricing?updated=package-price");
  });

  it("rejects malformed or out-of-range prices before writing", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });

    await expect(updatePackagePriceAction(makeFormData("package-1", "-1")))
      .rejects.toMatchObject({ digest: "NEXT_REDIRECT" });

    expect(mocks.redirect).toHaveBeenCalledWith("/admin/package-pricing?error=invalid-package-price");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("reports when the package no longer exists", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(updatePackagePriceAction(makeFormData())).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });

    expect(mocks.redirect).toHaveBeenCalledWith("/admin/package-pricing?error=package-not-found");
  });
});
