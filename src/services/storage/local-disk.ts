import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageService, PutObjectInput, SignedUrlInput } from "./types";
import { publicEnv } from "@/lib/env";

const ROOT = path.join(process.cwd(), ".storage");

function resolveKey(key: string) {
  const root = path.resolve(ROOT);
  const normalizedKey = key.replace(/\\/g, "/");
  const resolved = path.resolve(root, normalizedKey);
  const relative = path.relative(root, resolved);
  if (!normalizedKey || normalizedKey.startsWith("/") || normalizedKey.includes("..") || !relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Invalid storage key.");
  }
  return resolved;
}

export class LocalDiskStorage implements StorageService {
  async putObject(input: PutObjectInput): Promise<void> {
    const filePath = resolveKey(input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(resolveKey(key));
  }

  async getSignedUploadUrl(input: SignedUrlInput): Promise<string> {
    const origin = publicEnv().NEXT_PUBLIC_APP_URL;
    return `${origin}/api/storage/upload?key=${encodeURIComponent(input.key)}`;
  }

  async getSignedDownloadUrl(input: SignedUrlInput): Promise<string> {
    const origin = publicEnv().NEXT_PUBLIC_APP_URL;
    return `${origin}/api/storage/download?key=${encodeURIComponent(input.key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    await unlink(resolveKey(key)).catch(() => undefined);
  }
}
