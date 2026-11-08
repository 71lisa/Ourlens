import sharp from "sharp";
import type { PhotoFilterId, PhotoFrameId } from "@/features/memories/media-studio-config";

const MAX_INPUT_PIXELS = 25_000_000;
const MAX_OUTPUT_DIMENSION = 1800;

export class InvalidPhotoError extends Error {
  constructor() {
    super("Foto ini tidak dapat dibaca. Pilih gambar JPG, PNG, atau WebP yang valid.");
    this.name = "InvalidPhotoError";
  }
}

type FrameLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
  bottom: number;
  background: string;
  text: string;
  accent: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function eventDateLabel(eventDate: Date | null): string {
  return eventDate
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(eventDate)
    : "";
}

function filterSvg(filter: PhotoFilterId, width: number, height: number): Buffer | undefined {
  const overlay = filter === "DISPOSABLE_CAM"
    ? `<rect width="100%" height="100%" fill="#d28b43" opacity=".14"/><rect width="100%" height="100%" fill="url(#v)" opacity=".34"/>`
    : filter === "VINTAGE_FILM"
      ? `<rect width="100%" height="100%" fill="#b68b53" opacity=".2"/><rect width="100%" height="100%" fill="url(#v)" opacity=".2"/>`
      : filter === "RETRO"
        ? `<rect width="100%" height="100%" fill="#d97545" opacity=".12"/>`
        : "";
  if (!overlay) return undefined;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="v"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#342016" stop-opacity=".55"/></radialGradient></defs>${overlay}</svg>`,
  );
}

function frameLayout(
  frame: PhotoFrameId,
  photoWidth: number,
  photoHeight: number,
): FrameLayout | undefined {
  if (frame === "NO_FRAME") return undefined;
  const scale = Math.min(photoWidth, photoHeight);
  if (frame === "FILM_FRAME") {
    const side = Math.round(scale * 0.1);
    const top = Math.round(scale * 0.04);
    const bottom = Math.round(scale * 0.16);
    return {
      width: photoWidth + side * 2,
      height: photoHeight + top + bottom,
      left: side,
      top,
      bottom,
      background: "#29251f",
      text: "#f5ead6",
      accent: "#d7c6a5",
    };
  }
  const side = Math.round(scale * (frame === "MINIMAL_FRAME" ? 0.025 : 0.055));
  const top = side;
  const bottom = Math.round(scale * (frame === "MINIMAL_FRAME" ? 0.13 : 0.2));
  return {
    width: photoWidth + side * 2,
    height: photoHeight + top + bottom,
    left: side,
    top,
    bottom,
    background: frame === "POLAROID_VINTAGE"
      ? "#eee3cf"
      : frame === "POLAROID_WHITE"
        ? "#fffdf9"
        : "#f7f1ea",
    text: "#453d35",
    accent: "#d4a37c",
  };
}

function frameSvg(
  frame: PhotoFrameId,
  layout: FrameLayout,
  eventName: string,
  eventDate: string,
): Buffer {
  const { width, height, left, top, bottom, text, accent } = layout;
  const fontSize = Math.max(16, Math.min(width, height) * 0.035);
  const dateSize = Math.max(12, fontSize * 0.62);
  const titleAscent = fontSize * 0.8;
  const dateBaselineOffset = dateSize * 1.65;
  const labelBlockHeight = titleAscent + dateBaselineOffset;
  const labelY = height - bottom + (bottom - labelBlockHeight) / 2 + titleAscent;
  const title = escapeXml(eventName.slice(0, 100));
  const date = escapeXml(eventDate);
  const filmDetails = frame === "FILM_FRAME"
    ? `<g fill="${accent}">${Array.from({ length: 8 }, (_, index) => {
        const y = Math.round(top * 0.45 + index * ((height - top * 0.9) / 7));
        return `<rect x="${Math.round(left * 0.22)}" y="${y}" width="${Math.round(left * 0.42)}" height="${Math.max(10, Math.round(top * 0.5))}" rx="3"/><rect x="${width - Math.round(left * 0.64)}" y="${y}" width="${Math.round(left * 0.42)}" height="${Math.max(10, Math.round(top * 0.5))}" rx="3"/>`;
      }).join("")}</g>`
    : frame === "MINIMAL_FRAME"
      ? `<rect x="${left / 2}" y="${top / 2}" width="${width - left}" height="${height - top}" fill="none" stroke="${accent}" stroke-width="${Math.max(2, fontSize * 0.12)}"/>`
      : "";

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${filmDetails}<text x="${width / 2}" y="${labelY}" text-anchor="middle" fill="${text}" font-family="Georgia,serif" font-size="${fontSize}" font-weight="600" textLength="${Math.max(40, width * 0.78)}" lengthAdjust="spacingAndGlyphs">${title}</text><text x="${width / 2}" y="${labelY + dateSize * 1.65}" text-anchor="middle" fill="${text}" font-family="Arial,sans-serif" font-size="${dateSize}">${date}</text></svg>`,
  );
}

export async function renderGuestPhoto(input: {
  bytes: Uint8Array;
  filter: PhotoFilterId;
  frame: PhotoFrameId;
  eventName: string;
  eventDate: Date | null;
}): Promise<Buffer> {
  let photo: Buffer;
  let photoWidth: number;
  let photoHeight: number;
  try {
    const pipeline = sharp(input.bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });

    switch (input.filter) {
      case "DISPOSABLE_CAM":
        pipeline.modulate({ brightness: 1.04, saturation: 1.28, hue: 8 }).linear(1.05, -5);
        break;
      case "VINTAGE_FILM":
        pipeline.modulate({ brightness: 1.04, saturation: 0.76, hue: -5 }).linear(1.03, -3);
        break;
      case "RETRO":
        pipeline.modulate({ brightness: 1.02, saturation: 1.15, hue: 18 }).linear(1.06, -6);
        break;
      case "CLASSIC":
        pipeline.greyscale().linear(1.08, -6);
        break;
      case "ORIGINAL":
        break;
    }

    const result = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    photo = result.data;
    photoWidth = result.info.width;
    photoHeight = result.info.height;
  } catch {
    throw new InvalidPhotoError();
  }

  const colorOverlay = filterSvg(input.filter, photoWidth, photoHeight);
  if (colorOverlay) {
    photo = await sharp(photo)
      .composite([{ input: colorOverlay, blend: "soft-light" }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }

  const layout = frameLayout(input.frame, photoWidth, photoHeight);
  if (!layout) return photo;

  const decoration = frameSvg(input.frame, layout, input.eventName, eventDateLabel(input.eventDate));
  return sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 3,
      background: layout.background,
    },
  })
    .composite([
      { input: photo, left: layout.left, top: layout.top },
      { input: decoration, left: 0, top: 0 },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
