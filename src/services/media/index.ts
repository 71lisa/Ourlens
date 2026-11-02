import type { MediaProcessingService, ProcessMediaInput, ProcessMediaResult } from "./types";

export class NoopMediaProcessingService implements MediaProcessingService {
  async process(_input: ProcessMediaInput): Promise<ProcessMediaResult> {
    return {};
  }
}

export function getMediaProcessingService(): MediaProcessingService {
  return new NoopMediaProcessingService();
}
