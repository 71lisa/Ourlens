export type StorageBreakdown = {
  quotaBytes: bigint;
  usedBytes: bigint;
  photoBytes: bigint;
  videoBytes: bigint;
  otherBytes: bigint;
};

export type IncomingMediaBytes = {
  photoBytes?: bigint;
  videoBytes?: bigint;
  otherBytes?: bigint;
};

export function usageRatio(usedBytes: bigint, quotaBytes: bigint): number {
  if (quotaBytes <= 0n) {
    return usedBytes > 0n ? Number.POSITIVE_INFINITY : 0;
  }
  return Number(usedBytes) / Number(quotaBytes);
}

export function remainingBytes(usage: Pick<StorageBreakdown, "quotaBytes" | "usedBytes">): bigint {
  const remaining = usage.quotaBytes - usage.usedBytes;
  return remaining > 0n ? remaining : 0n;
}

export function canAcceptUpload(
  usage: Pick<StorageBreakdown, "quotaBytes" | "usedBytes">,
  incomingBytes: bigint,
): boolean {
  if (incomingBytes < 0n) {
    return false;
  }
  return usage.usedBytes + incomingBytes <= usage.quotaBytes;
}

export function applyUsageDelta(
  usage: StorageBreakdown,
  incoming: IncomingMediaBytes,
): StorageBreakdown {
  const photoBytes = incoming.photoBytes ?? 0n;
  const videoBytes = incoming.videoBytes ?? 0n;
  const otherBytes = incoming.otherBytes ?? 0n;
  const added = photoBytes + videoBytes + otherBytes;

  return {
    quotaBytes: usage.quotaBytes,
    usedBytes: usage.usedBytes + added,
    photoBytes: usage.photoBytes + photoBytes,
    videoBytes: usage.videoBytes + videoBytes,
    otherBytes: usage.otherBytes + otherBytes,
  };
}
