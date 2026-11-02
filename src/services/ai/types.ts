export type AIImageInput = {
  storageKey: string;
};

export interface AIService {
  enhanceImage(input: AIImageInput): Promise<{ storageKey: string }>;
  generateCaption(input: AIImageInput): Promise<{ caption: string }>;
  classifyMedia(input: AIImageInput): Promise<{ labels: string[] }>;
  detectDuplicates(input: AIImageInput): Promise<{ duplicateAssetIds: string[] }>;
  analyzeQuality(input: AIImageInput): Promise<{ score: number }>;
  moderate(input: AIImageInput): Promise<{ allowed: boolean; reasons: string[] }>;
  curateAlbum(eventId: string): Promise<{ memoryIds: string[] }>;
  generateHighlights(eventId: string): Promise<{ assetIds: string[] }>;
}
