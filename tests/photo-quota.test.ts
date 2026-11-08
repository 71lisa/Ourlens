import { describe, expect, it } from "vitest";
import {
  getEstimatedPhotoCapacity,
  getPackageGuestCapacity,
  getRemainingPhotoQuota,
  GUEST_PHOTO_LIMIT,
  hasGuestUploadCapacity,
} from "@/lib/photo-quota";

describe("guest photo quotas", () => {
  it("calculates finite package capacity from the per-guest limit", () => {
    expect(GUEST_PHOTO_LIMIT).toBe(20);
    expect(getEstimatedPhotoCapacity({
      name: "5 tamu",
      guestCapacity: 5,
      isUnlimited: false,
    })).toBe(100);
    expect(getEstimatedPhotoCapacity({
      name: "50 tamu",
      guestCapacity: 50,
      isUnlimited: false,
    })).toBe(1000);
    expect(getEstimatedPhotoCapacity({
      name: "200 tamu",
      guestCapacity: 200,
      isUnlimited: false,
    })).toBe(4000);
  });

  it("leaves unlimited guest packages without a fixed guest or photo count", () => {
    const unlimited = {
      name: "Tidak Terbatas",
      guestCapacity: 999999,
      isUnlimited: true,
    };
    expect(getPackageGuestCapacity(unlimited)).toBeNull();
    expect(getEstimatedPhotoCapacity(unlimited)).toBeNull();
    expect(hasGuestUploadCapacity({
      participantCount: 100_000,
      guestPhotoCount: 0,
      guestCapacity: getPackageGuestCapacity(unlimited),
    })).toBe(true);
  });

  it("uses the established capacity mapping for legacy package names", () => {
    expect(getPackageGuestCapacity({ name: "Basic", guestCapacity: null })).toBe(5);
    expect(getPackageGuestCapacity({ name: "Premium", guestCapacity: null })).toBe(10);
    expect(getPackageGuestCapacity({ name: "Exclusive", guestCapacity: null })).toBe(25);
  });

  it("limits new guest sessions while letting a participating guest use remaining quota", () => {
    expect(hasGuestUploadCapacity({
      participantCount: 5,
      guestPhotoCount: 0,
      guestCapacity: 5,
    })).toBe(false);
    expect(hasGuestUploadCapacity({
      participantCount: 5,
      guestPhotoCount: 1,
      guestCapacity: 5,
    })).toBe(true);
  });

  it("never returns negative remaining photo quota", () => {
    expect(getRemainingPhotoQuota(8, 20)).toBe(12);
    expect(getRemainingPhotoQuota(20, 20)).toBe(0);
    expect(getRemainingPhotoQuota(21, 20)).toBe(0);
  });
});
