import type { PhotoFilterId, PhotoFrameId } from "@/features/memories/media-studio-config";

export type ImageEditOptions = {
  filter: PhotoFilterId;
  frame: PhotoFrameId;
  enhanced: boolean;
};

export interface ImageProcessingService {
  renderPhoto(source: File, options: ImageEditOptions): Promise<Blob>;
}