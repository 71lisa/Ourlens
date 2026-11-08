import { PHOTO_FILTERS, PHOTO_FRAMES } from "@/features/memories/media-studio-config";
import type { ImageEditOptions, ImageProcessingService } from "./types";

const MAX_OUTPUT_DIMENSION = 1800;
const JPEG_QUALITY = 0.88;

type FrameInsets = { left: number; top: number; right: number; bottom: number };

function frameInsets(frame: ImageEditOptions["frame"], width: number, height: number): FrameInsets {
  const scale = Math.min(width, height);
  switch (frame) {
    case "POLAROID_WHITE":
    case "POLAROID_VINTAGE":
      return { left: scale * 0.055, top: scale * 0.055, right: scale * 0.055, bottom: scale * 0.2 };
    case "FILM_FRAME":
      return { left: scale * 0.09, top: scale * 0.04, right: scale * 0.09, bottom: scale * 0.15 };
    case "MINIMAL_FRAME":
      return { left: scale * 0.025, top: scale * 0.025, right: scale * 0.025, bottom: scale * 0.13 };
    default:
      return { left: 0, top: 0, right: 0, bottom: 0 };
  }
}

function loadImage(source: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto tidak dapat dibuka. Pilih gambar lain."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Foto tidak dapat disiapkan. Pilih gambar lain.")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export class LocalCanvasImageProcessingService implements ImageProcessingService {
  async renderPhoto(source: File, options: ImageEditOptions): Promise<Blob> {
    const filter = PHOTO_FILTERS.find((item) => item.id === options.filter);
    const frame = PHOTO_FRAMES.find((item) => item.id === options.frame);
    if (!filter || !frame) throw new Error("Pilih gaya foto yang valid.");

    const { image, url } = await loadImage(source);
    try {
      const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
      const photoWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const photoHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      const insets = frameInsets(options.frame, photoWidth, photoHeight);
      const width = Math.round(photoWidth + insets.left + insets.right);
      const height = Math.round(photoHeight + insets.top + insets.bottom);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Penyuntingan foto tidak tersedia di peramban ini.");

      context.fillStyle = options.frame === "FILM_FRAME"
        ? "#29251f"
        : options.frame === "POLAROID_VINTAGE"
          ? "#eee3cf"
          : options.frame === "POLAROID_WHITE"
            ? "#fffdf9"
            : "#f7f1ea";
      context.fillRect(0, 0, width, height);
      context.filter = [
        filter.cssFilter,
        options.enhanced ? "brightness(1.06) contrast(1.1) saturate(1.08)" : "",
      ].filter(Boolean).join(" ");
      context.drawImage(image, insets.left, insets.top, photoWidth, photoHeight);
      context.filter = "none";

      if (options.frame === "FILM_FRAME") {
        context.fillStyle = "#e7d6b7";
        const holeWidth = Math.max(8, width * 0.035);
        const holeHeight = Math.max(8, height * 0.035);
        for (let y = height * 0.035; y < height * 0.9; y += height * 0.1) {
          context.fillRect(width * 0.025, y, holeWidth, holeHeight);
          context.fillRect(width * 0.94, y, holeWidth, holeHeight);
        }
      } else if (options.frame === "MINIMAL_FRAME") {
        context.strokeStyle = "#d4a37c";
        context.lineWidth = Math.max(2, Math.min(width, height) * 0.004);
        context.strokeRect(insets.left / 2, insets.top / 2, width - insets.left, height - insets.top);
      }

      if (options.frame !== "NO_FRAME") {
        const labelY = height - insets.bottom * 0.6;
        context.textAlign = "center";
        context.fillStyle = options.frame === "FILM_FRAME" ? "#f5ead6" : "#453d35";
        context.font = `600 ${Math.max(14, Math.min(width, height) * 0.035)}px Georgia, serif`;
        context.fillText(options.eventName, width / 2, labelY, width * 0.82);
        context.font = `${Math.max(11, Math.min(width, height) * 0.022)}px Arial, sans-serif`;
        context.fillText(options.eventDate, width / 2, labelY + Math.max(16, Math.min(width, height) * 0.045), width * 0.82);
      }

      return await canvasToJpeg(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function getLocalImageProcessingService(): ImageProcessingService {
  return new LocalCanvasImageProcessingService();
}
