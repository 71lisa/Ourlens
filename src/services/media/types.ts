export type MediaKind = "photo" | "video" | "live_moment";

export type ProcessMediaInput = {
  assetId: string;
  storageKey: string;
  kind: MediaKind;
};

export type ProcessMediaResult = {
  optimizedStorageKey?: string;
  thumbnailStorageKey?: string;
};

export interface MediaProcessingService {
  process(input: ProcessMediaInput): Promise<ProcessMediaResult>;
}
