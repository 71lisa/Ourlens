import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import type { StorageService, PutObjectInput, SignedUrlInput } from "./types";

export function getS3Config() {
  const config = env();
  const endpoint = config.STORAGE_ENDPOINT;
  const bucket = config.STORAGE_BUCKET;
  const region = config.STORAGE_REGION ?? "us-east-1";
  const accessKey = config.STORAGE_ACCESS_KEY;
  const secretKey = config.STORAGE_SECRET_KEY;
  const isConfigured = Boolean(endpoint && bucket && accessKey && secretKey);

  return {
    endpoint,
    bucket,
    region,
    accessKey,
    secretKey,
    isConfigured,
  };
}

export class S3CompatibleStorage implements StorageService {
  async putObject(input: PutObjectInput): Promise<void> {
    const cfg = getS3Config();
    if (!cfg.isConfigured || !cfg.endpoint || !cfg.bucket) {
      throw new AppError({
        message: "S3-compatible storage is not configured. Set STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY for production use.",
        code: "STORAGE_NOT_CONFIGURED",
      });
    }

    const objectUrl = `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${encodeURIComponent(input.key)}`;
    const response = await fetch(objectUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "x-amz-meta-event": "ourlens",
      },
      body: input.body instanceof Uint8Array ? new Uint8Array(input.body).buffer : Buffer.from(input.body),
    });
    if (!response.ok) {
      throw new AppError({
        message: "S3-compatible storage write failed.",
        code: "STORAGE_WRITE_FAILED",
      });
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const cfg = getS3Config();
    if (!cfg.isConfigured || !cfg.endpoint || !cfg.bucket) {
      throw new AppError({
        message: "S3-compatible storage is not configured.",
        code: "STORAGE_NOT_CONFIGURED",
      });
    }

    const objectUrl = `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${encodeURIComponent(key)}`;
    const response = await fetch(objectUrl);
    if (!response.ok) {
      throw new AppError({
        message: "S3-compatible storage read failed.",
        code: "STORAGE_READ_FAILED",
      });
    }
    const data = Buffer.from(await response.arrayBuffer());
    return data;
  }

  async getSignedUploadUrl(input: SignedUrlInput): Promise<string> {
    const cfg = getS3Config();
    if (!cfg.isConfigured || !cfg.endpoint || !cfg.bucket) {
      throw new AppError({ message: "S3-compatible storage is not configured.", code: "STORAGE_NOT_CONFIGURED" });
    }
    return `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${encodeURIComponent(input.key)}?contentType=${encodeURIComponent(input.contentType ?? "application/octet-stream")}`;
  }

  async getSignedDownloadUrl(input: SignedUrlInput): Promise<string> {
    const cfg = getS3Config();
    if (!cfg.isConfigured || !cfg.endpoint || !cfg.bucket) {
      throw new AppError({ message: "S3-compatible storage is not configured.", code: "STORAGE_NOT_CONFIGURED" });
    }
    return `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${encodeURIComponent(input.key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    const cfg = getS3Config();
    if (!cfg.isConfigured || !cfg.endpoint || !cfg.bucket) {
      throw new AppError({
        message: "S3-compatible storage is not configured.",
        code: "STORAGE_NOT_CONFIGURED",
      });
    }

    const objectUrl = `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${encodeURIComponent(key)}`;
    const response = await fetch(objectUrl, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new AppError({
        message: "S3-compatible storage delete failed.",
        code: "STORAGE_DELETE_FAILED",
      });
    }
  }
}
