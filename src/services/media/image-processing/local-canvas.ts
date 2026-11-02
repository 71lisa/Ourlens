import { PHOTO_FILTERS, PHOTO_FRAMES } from "@/features/memories/media-studio-config";
import type { ImageEditOptions, ImageProcessingService } from "./types";

const MAX_OUTPUT_DIMENSION = 1800;
const JPEG_QUALITY = 0.86;

type PhotoRect = { x: number; y: number; width: number; height: number };

function framePhotoRect(frame: ImageEditOptions["frame"], width: number, height: number): PhotoRect {
  switch (frame) {
    case "minimal":
      return { x: width * 0.035, y: height * 0.035, width: width * 0.93, height: height * 0.93 };
    case "polaroid":
      return { x: width * 0.07, y: height * 0.06, width: width * 0.86, height: height * 0.72 };
    case "film-strip":
      return { x: width * 0.13, y: height * 0.04, width: width * 0.74, height: height * 0.92 };
    case "wedding":
    case "celebration":
      return { x: width * 0.07, y: height * 0.07, width: width * 0.86, height: height * 0.86 };
    default:
      return { x: 0, y: 0, width, height };
  }
}

function paintFrame(
  context: CanvasRenderingContext2D,
  frame: ImageEditOptions["frame"],
  width: number,
  height: number,
): void {
  const minDimension = Math.min(width, height);
  const photo = framePhotoRect(frame, width, height);

  if (frame === "minimal" || frame === "polaroid") {
    context.fillStyle = frame === "polaroid" ? "#fffdf9" : "#f7f1ea";
    context.fillRect(0, 0, width, height);
    return;
  }

  if (frame === "film-strip") {
    context.fillStyle = "#2e2e2e";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#d4a37c";
    const holeWidth = width * 0.045;
    const holeHeight = height * 0.055;
    for (let y = height * 0.04; y < height * 0.94; y += height * 0.12) {
      context.fillRect(width * 0.04, y, holeWidth, holeHeight);
      context.fillRect(width * 0.915, y, holeWidth, holeHeight);
    }
    return;
  }

  if (frame === "wedding" || frame === "celebration") {
    context.fillStyle = "#f7f1ea";
    context.fillRect(0, 0, width, height);
    return;
  }

  if (frame === "none") return;

  context.strokeStyle = frame === "wedding" ? "#8b0000" : "#d9a6a8";
  context.lineWidth = Math.max(2, minDimension * 0.009);
  context.strokeRect(photo.x / 2, photo.y / 2, width - photo.x, height - photo.y);
}

function decorateFrame(
  context: CanvasRenderingContext2D,
  frame: ImageEditOptions["frame"],
  width: number,
  height: number,
): void {
  const minDimension = Math.min(width, height);
  const photo = framePhotoRect(frame, width, height);

  if (frame === "minimal") {
    context.strokeStyle = "#d4a37c";
    context.lineWidth = Math.max(2, minDimension * 0.004);
    context.strokeRect(photo.x / 2, photo.y / 2, width - photo.x, height - photo.y);
  }

  if (frame === "wedding") {
    context.strokeStyle = "#8b0000";
    context.lineWidth = Math.max(2, minDimension * 0.004);
    context.strokeRect(photo.x * 0.38, photo.y * 0.38, width - photo.x * 0.76, height - photo.y * 0.76);
    context.fillStyle = "#d4a37c";
    const radius = minDimension * 0.012;
    for (const [x, y] of [[photo.x * 0.38, photo.y * 0.38], [width - photo.x * 0.38, photo.y * 0.38], [photo.x * 0.38, height - photo.y * 0.38], [width - photo.x * 0.38, height - photo.y * 0.38]]) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (frame === "celebration") {
    const radius = minDimension * 0.018;
    const colors = ["#8b0000", "#d4a37c", "#d9a6a8"];
    const points = [
      [photo.x * 0.52, photo.y * 0.52],
      [width - photo.x * 0.52, photo.y * 0.52],
      [photo.x * 0.52, height - photo.y * 0.52],
      [width - photo.x * 0.52, height - photo.y * 0.52],
    ];
    points.forEach(([x, y], index) => {
      context.fillStyle = colors[index % colors.length];
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });
  }
}

function loadImage(source: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo could not be opened. Choose another image."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("This photo could not be prepared. Try another image.")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export class LocalCanvasImageProcessingService implements ImageProcessingService {
  async renderPhoto(source: File, options: ImageEditOptions): Promise<Blob> {
    const filter = PHOTO_FILTERS.find((item) => item.id === options.filter);
    const frame = PHOTO_FRAMES.find((item) => item.id === options.frame);
    if (!filter || !frame) throw new Error("Choose a valid photo treatment.");

    const { image, url } = await loadImage(source);
    try {
      const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Photo editing is not available in this browser.");

      paintFrame(context, options.frame, width, height);
      const photo = framePhotoRect(options.frame, width, height);
      context.filter = [
        filter.cssFilter,
        options.enhanced ? "brightness(1.06) contrast(1.1) saturate(1.08)" : "",
      ].filter(Boolean).join(" ");
      context.drawImage(image, photo.x, photo.y, photo.width, photo.height);
      context.filter = "none";
      decorateFrame(context, options.frame, width, height);
      return await canvasToJpeg(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function getLocalImageProcessingService(): ImageProcessingService {
  return new LocalCanvasImageProcessingService();
}