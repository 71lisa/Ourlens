export type PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
};

export type SignedUrlInput = {
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
};

export interface StorageService {
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getSignedUploadUrl(input: SignedUrlInput): Promise<string>;
  getSignedDownloadUrl(input: SignedUrlInput): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
