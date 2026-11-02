import { AppError } from "@/lib/errors";
import type { AIService, AIImageInput } from "./types";

export class NoopAIService implements AIService {
  private unavailable(): never {
    throw new AppError({
      message: "AI provider is not configured for this environment.",
      userMessage: "AI features are not available yet.",
      code: "AI_NOT_CONFIGURED",
      statusCode: 501,
    });
  }

  async enhanceImage(_input: AIImageInput) {
    return this.unavailable();
  }
  async generateCaption(_input: AIImageInput) {
    return this.unavailable();
  }
  async classifyMedia(_input: AIImageInput) {
    return this.unavailable();
  }
  async detectDuplicates(_input: AIImageInput) {
    return this.unavailable();
  }
  async analyzeQuality(_input: AIImageInput) {
    return this.unavailable();
  }
  async moderate(_input: AIImageInput) {
    return this.unavailable();
  }
  async curateAlbum(_eventId: string) {
    return this.unavailable();
  }
  async generateHighlights(_eventId: string) {
    return this.unavailable();
  }
}

export function getAIService(): AIService {
  return new NoopAIService();
}
