import type { Package } from "@prisma/client";

export type PackageSnapshot = {
  name: string;
  guestCapacity?: number | null;
  isUnlimited?: boolean;
  price: string;
  currency: string;
  storageLimitBytes: string;
  photoLimit: number | null;
  videoLimit: number | null;
  videoDurationLimit: number | null;
  eventDurationDays: number;
  retentionDays: number;
  customEventPage: boolean;
  customQRCode: boolean;
  filtersEnabled: boolean;
  framesEnabled: boolean;
  aiEnhancementEnabled: boolean;
  aiCurationEnabled: boolean;
  digitalAlbumEnabled: boolean;
  liveMomentEnabled: boolean;
  eventChallengesEnabled: boolean;
};

export function createPackageSnapshot(item: Package): PackageSnapshot {
  return {
    name: item.name,
    guestCapacity: item.guestCapacity,
    isUnlimited: item.isUnlimited,
    price: item.price.toString(),
    currency: item.currency,
    storageLimitBytes: item.storageLimitBytes.toString(),
    photoLimit: item.photoLimit,
    videoLimit: item.videoLimit,
    videoDurationLimit: item.videoDurationLimit,
    eventDurationDays: item.eventDurationDays,
    retentionDays: item.retentionDays,
    customEventPage: item.customEventPage,
    customQRCode: item.customQRCode,
    filtersEnabled: item.filtersEnabled,
    framesEnabled: item.framesEnabled,
    aiEnhancementEnabled: item.aiEnhancementEnabled,
    aiCurationEnabled: item.aiCurationEnabled,
    digitalAlbumEnabled: item.digitalAlbumEnabled,
    liveMomentEnabled: item.liveMomentEnabled,
    eventChallengesEnabled: item.eventChallengesEnabled,
  };
}

export function parsePackageSnapshot(value: unknown): PackageSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    typeof record.price !== "string" ||
    typeof record.currency !== "string" ||
    typeof record.storageLimitBytes !== "string" ||
    typeof record.retentionDays !== "number" ||
    typeof record.eventDurationDays !== "number"
  ) {
    return null;
  }
  if (
    record.guestCapacity !== undefined &&
    record.guestCapacity !== null &&
    typeof record.guestCapacity !== "number"
  ) {
    return null;
  }
  if (record.isUnlimited !== undefined && typeof record.isUnlimited !== "boolean") {
    return null;
  }
  return record as PackageSnapshot;
}

export function isPackagePriceConfigured(price: { toString(): string }, currency: string): boolean {
  const amount = Number(price.toString());
  return currency === "IDR" && Number.isSafeInteger(amount) && amount > 0;
}
