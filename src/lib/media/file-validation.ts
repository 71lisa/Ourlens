export const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
]);

export type FileValidationInput = {
  mimeType: string;
  fileSize: number;
  kind: "photo" | "video";
  fileName?: string;
};

export function hasAllowedMediaExtension(
  fileName: string,
  mimeType: string,
  kind: "photo" | "video",
): boolean {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = kind === "photo"
    ? mimeType === "image/jpeg" ? [".jpg", ".jpeg"]
      : mimeType === "image/png" ? [".png"]
        : mimeType === "image/webp" ? [".webp"] : []
    : mimeType === "video/mp4" ? [".mp4"]
      : mimeType === "video/quicktime" ? [".mov"] : [];
  return allowedExtensions.includes(extension);
}

export function validateMediaFile(input: FileValidationInput): {
  ok: boolean;
  error?: string;
} {
  if (input.fileSize <= 0) {
    return { ok: false, error: "Berkas kosong." };
  }
  const maxBytes = input.kind === "photo" ? MAX_PHOTO_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES;
  if (input.fileSize > maxBytes) {
    return { ok: false, error: "Ukuran berkas melebihi batas acara." };
  }

  const allowed =
    input.kind === "photo" ? ALLOWED_PHOTO_TYPES : ALLOWED_VIDEO_TYPES;
  if (!allowed.has(input.mimeType.toLowerCase())) {
    return { ok: false, error: "Jenis berkas ini tidak didukung." };
  }
  if (
    input.fileName &&
    !hasAllowedMediaExtension(input.fileName, input.mimeType.toLowerCase(), input.kind)
  ) {
    return { ok: false, error: "Ekstensi berkas tidak sesuai dengan jenis medianya." };
  }

  return { ok: true };
}

export function detectPhotoMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  return undefined;
}

export function detectVideoMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length < 12 || readAscii(bytes, 4, 4) !== "ftyp") return undefined;
  const boxSize = readUint32(bytes, 0);
  if (boxSize < 16 || boxSize > bytes.length) return undefined;

  const brands = [readAscii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(readAscii(bytes, offset, 4));
  }

  if (brands.includes("qt  ")) return "video/quicktime";
  if (brands.some((brand) => /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(brand))) {
    return "video/mp4";
  }
  return undefined;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

type Mp4Box = { type: string; offset: number; size: number; headerSize: number };

function readMp4Box(bytes: Uint8Array, offset: number, end: number): Mp4Box | undefined {
  if (offset + 8 > end) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size32 = view.getUint32(offset);
  const type = readAscii(bytes, offset + 4, 4);
  let size = size32;
  let headerSize = 8;

  if (size32 === 1) {
    if (offset + 16 > end) return undefined;
    const extendedSize = view.getBigUint64(offset + 8);
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
    size = Number(extendedSize);
    headerSize = 16;
  } else if (size32 === 0) {
    size = end - offset;
  }

  if (size < headerSize || offset + size > end) return undefined;
  return { type, offset, size, headerSize };
}

function readMp4HeaderDuration(bytes: Uint8Array, box: Mp4Box): number | undefined {
  const bodyOffset = box.offset + box.headerSize;
  const boxEnd = box.offset + box.size;
  if (bodyOffset + 20 > boxEnd) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[bodyOffset];
  if (version !== 0 && version !== 1) return undefined;

  const timescaleOffset = bodyOffset + (version === 1 ? 20 : 12);
  const durationOffset = bodyOffset + (version === 1 ? 24 : 16);
  if (timescaleOffset + 4 > boxEnd) return undefined;

  const timescale = view.getUint32(timescaleOffset);
  let duration: number;
  if (version === 1) {
    if (durationOffset + 8 > boxEnd) return undefined;
    const rawDuration = view.getBigUint64(durationOffset);
    if (rawDuration > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
    duration = Number(rawDuration);
  } else {
    if (durationOffset + 4 > boxEnd) return undefined;
    const rawDuration = view.getUint32(durationOffset);
    if (rawDuration === 0xffffffff) return undefined;
    duration = rawDuration;
  }

  const seconds = duration / timescale;
  return timescale > 0 && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : undefined;
}

function findDirectChild(
  bytes: Uint8Array,
  parent: Mp4Box,
  childType: string,
): Mp4Box | undefined {
  const end = parent.offset + parent.size;
  for (let offset = parent.offset + parent.headerSize; offset < end;) {
    const box = readMp4Box(bytes, offset, end);
    if (!box) return undefined;
    if (box.type === childType) return box;
    offset += box.size;
  }
  return undefined;
}

export function readVideoDurationSeconds(bytes: Uint8Array): number | undefined {
  const fileType = readMp4Box(bytes, 0, bytes.length);
  if (!fileType || fileType.type !== "ftyp") return undefined;

  let moov: Mp4Box | undefined;
  for (let offset = fileType.offset + fileType.size; offset < bytes.length;) {
    const box = readMp4Box(bytes, offset, bytes.length);
    if (!box) return undefined;
    if (box.type === "moov") {
      moov = box;
      break;
    }
    offset += box.size;
  }
  if (!moov) return undefined;

  const movieHeader = findDirectChild(bytes, moov, "mvhd");
  if (!movieHeader) return undefined;
  const movieDuration = readMp4HeaderDuration(bytes, movieHeader);
  if (movieDuration === undefined) return undefined;

  let hasVideoTrack = false;
  let durationSeconds = movieDuration;
  for (let offset = moov.offset + moov.headerSize; offset < moov.offset + moov.size;) {
    const box = readMp4Box(bytes, offset, moov.offset + moov.size);
    if (!box) return undefined;
    if (box.type === "trak") {
      const mediaBox = findDirectChild(bytes, box, "mdia");
      if (!mediaBox) return undefined;
      const handlerBox = findDirectChild(bytes, mediaBox, "hdlr");
      const mediaHeader = findDirectChild(bytes, mediaBox, "mdhd");
      if (!handlerBox || !mediaHeader) return undefined;
      const handlerOffset = handlerBox.offset + handlerBox.headerSize + 8;
      if (handlerOffset + 4 > handlerBox.offset + handlerBox.size) return undefined;
      const handlerType = readAscii(bytes, handlerOffset, 4);
      const trackDuration = readMp4HeaderDuration(bytes, mediaHeader);
      if (trackDuration === undefined) return undefined;
      durationSeconds = Math.max(durationSeconds, trackDuration);
      if (handlerType === "vide") {
        hasVideoTrack = true;
      }
    }
    offset += box.size;
  }
  return hasVideoTrack ? durationSeconds : undefined;
}

export function validateVideoPayload(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileSize: number;
  maxDurationSeconds: number;
  fileName?: string;
}): { ok: true; mimeType: string; durationSeconds: number } | { ok: false; error: string } {
  const declaredType = (input.mimeType || "").toLowerCase();
  const detectedMimeType = detectVideoMimeType(input.bytes);
  if (!detectedMimeType || !ALLOWED_VIDEO_TYPES.has(declaredType) || detectedMimeType !== declaredType) {
    return { ok: false, error: "Pilih video MP4 atau MOV yang valid." };
  }

  const validation = validateMediaFile({
    mimeType: detectedMimeType,
    fileSize: input.fileSize,
    kind: "video",
    fileName: input.fileName,
  });
  if (!validation.ok) return { ok: false, error: validation.error ?? "Video ini tidak valid." };

  const durationSeconds = readVideoDurationSeconds(input.bytes);
  if (durationSeconds === undefined) {
    return { ok: false, error: "Durasi video tidak dapat diverifikasi." };
  }
  if (!Number.isFinite(input.maxDurationSeconds) || input.maxDurationSeconds <= 0) {
    return { ok: false, error: "Unggahan video belum diaktifkan untuk acara ini." };
  }
  if (durationSeconds > input.maxDurationSeconds) {
    return {
      ok: false,
      error: `Durasi video melebihi batas acara (${input.maxDurationSeconds} detik).`,
    };
  }

  return { ok: true, mimeType: detectedMimeType, durationSeconds };
}

export function validatePhotoPayload(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileSize: number;
  fileName?: string;
}): { ok: true; mimeType: string } | { ok: false; error: string } {
  const detectedMimeType = detectPhotoMimeType(input.bytes);
  if (!detectedMimeType || (input.mimeType && detectedMimeType !== input.mimeType.toLowerCase())) {
    return { ok: false, error: "Berkas yang dipilih bukan foto JPG, PNG, atau WebP yang didukung." };
  }

  const validation = validateMediaFile({
    mimeType: detectedMimeType,
    fileSize: input.fileSize,
    kind: "photo",
    fileName: input.fileName,
  });
  if (!validation.ok) return { ok: false, error: validation.error ?? "Foto ini tidak valid." };
  return { ok: true, mimeType: detectedMimeType };
}
