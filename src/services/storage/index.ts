import { env } from "@/lib/env";
import { LocalDiskStorage } from "./local-disk";
import { S3CompatibleStorage } from "./s3-compatible";
import type { StorageService } from "./types";

let instance: StorageService | undefined;

export function getStorageService(): StorageService {
  if (!instance) {
    instance = env().STORAGE_PROVIDER === "s3" ? new S3CompatibleStorage() : new LocalDiskStorage();
  }
  return instance;
}
