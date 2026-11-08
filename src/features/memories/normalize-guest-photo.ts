import { MAX_PHOTO_UPLOAD_BYTES } from "@/lib/media/file-validation";

export const MAX_SOURCE_PHOTO_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 4000;
const JPEG_QUALITIES = [0.88, 0.78, 0.68];

function decodeWithImageElement(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas ini bukan foto yang didukung. Pilih gambar JPG, PNG, atau WebP."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new Error("Foto tidak dapat disiapkan. Pilih gambar lain.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function normalizeGuestPhoto(file: File): Promise<File> {
  if (file.size <= 0) throw new Error("Foto yang dipilih kosong.");
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error("Ukuran foto terlalu besar untuk diproses. Pilih foto yang lebih kecil dari 32 MB.");
  }

  let bitmap: ImageBitmap | undefined;
  let image: HTMLImageElement | undefined;
  let releaseImage = () => {};
  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        const decoded = await decodeWithImageElement(file);
        image = decoded.image;
        releaseImage = decoded.release;
      }
    } else {
      const decoded = await decodeWithImageElement(file);
      image = decoded.image;
      releaseImage = decoded.release;
    }

    const sourceWidth = bitmap?.width ?? image?.naturalWidth ?? 0;
    const sourceHeight = bitmap?.height ?? image?.naturalHeight ?? 0;
    if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > 50_000_000) {
      throw new Error("Ukuran foto terlalu besar atau foto tidak dapat dibuka. Pilih foto lain.");
    }

    const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Pemrosesan foto tidak tersedia di peramban ini.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (bitmap) context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    else if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height);
    else throw new Error("Foto tidak dapat dibuka. Pilih foto lain.");

    let outputCanvas = canvas;
    for (let scale = 1; scale >= 0.4; scale *= 0.75) {
      if (scale < 1) {
        const resizedCanvas = document.createElement("canvas");
        resizedCanvas.width = Math.max(1, Math.round(canvas.width * scale));
        resizedCanvas.height = Math.max(1, Math.round(canvas.height * scale));
        const resizedContext = resizedCanvas.getContext("2d", { alpha: false });
        if (!resizedContext) throw new Error("Pemrosesan foto tidak tersedia di peramban ini.");
        resizedContext.fillStyle = "#fff";
        resizedContext.fillRect(0, 0, resizedCanvas.width, resizedCanvas.height);
        resizedContext.drawImage(canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
        outputCanvas = resizedCanvas;
      }

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpeg(outputCanvas, quality);
        if (blob.size <= MAX_PHOTO_UPLOAD_BYTES) {
          const baseName = file.name.replace(/\.[^.]*$/, "") || "photo";
          return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
    }

    throw new Error("Ukuran foto tetap lebih dari 8 MB setelah diproses. Pilih foto yang lebih kecil.");
  } finally {
    bitmap?.close();
    releaseImage();
  }
}
