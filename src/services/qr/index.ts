import QRCode from "qrcode";
import type { GenerateQrInput, QrService } from "./types";

export class QrCodeLibraryService implements QrService {
  async generate(input: GenerateQrInput): Promise<Buffer> {
    const format = input.format ?? "png";
    if (format === "svg") {
      const svg = await QRCode.toString(input.destinationUrl, {
        type: "svg",
        margin: 1,
        color: { dark: "#8B0000", light: "#F7F1EA" },
      });
      return Buffer.from(svg);
    }

    return QRCode.toBuffer(input.destinationUrl, {
      type: "png",
      margin: 1,
      color: { dark: "#8B0000", light: "#F7F1EA" },
    });
  }
}

export function getQrService(): QrService {
  return new QrCodeLibraryService();
}
