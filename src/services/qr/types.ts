export type QrRenderFormat = "png" | "svg";

export type GenerateQrInput = {
  destinationUrl: string;
  format?: QrRenderFormat;
};

export interface QrService {
  generate(input: GenerateQrInput): Promise<Buffer>;
}
