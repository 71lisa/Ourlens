export const GUEST_PHOTO_LIMIT = 20;

export type PackageGuestCapacity = {
  name: string;
  guestCapacity?: number | null;
  isUnlimited?: boolean;
};

export function getPackageGuestCapacity(
  packageInfo: PackageGuestCapacity | null | undefined,
): number | null {
  if (!packageInfo) return 0;
  if (packageInfo.isUnlimited === true || packageInfo.name.toLowerCase().includes("tidak terbatas")) {
    return null;
  }
  if (
    typeof packageInfo.guestCapacity === "number" &&
    Number.isSafeInteger(packageInfo.guestCapacity) &&
    packageInfo.guestCapacity > 0
  ) {
    return packageInfo.guestCapacity;
  }
  const capacityFromName = Number(packageInfo.name.match(/^(\d+)/)?.[1] ?? 0);
  if (Number.isSafeInteger(capacityFromName) && capacityFromName > 0) return capacityFromName;
  const legacyCapacities: Record<string, number> = {
    basic: 5,
    premium: 10,
    exclusive: 25,
  };
  return legacyCapacities[packageInfo.name.trim().toLowerCase()] ?? 0;
}

export function getEstimatedPhotoCapacity(
  packageInfo: PackageGuestCapacity,
): number | null {
  const guestCapacity = getPackageGuestCapacity(packageInfo);
  return guestCapacity === null ? null : guestCapacity * GUEST_PHOTO_LIMIT;
}

export function hasGuestUploadCapacity(input: {
  participantCount: number;
  guestPhotoCount: number;
  guestCapacity: number | null;
}): boolean {
  return input.guestPhotoCount > 0 ||
    input.guestCapacity === null ||
    input.participantCount < input.guestCapacity;
}

export function getRemainingPhotoQuota(photoCount: number, limit: number): number {
  return Math.max(0, limit - photoCount);
}
