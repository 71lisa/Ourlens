export const PHOTO_FILTERS = [
  { id: "ORIGINAL", name: "Asli", cssFilter: "none" },
  { id: "DISPOSABLE_CAM", name: "Kamera Sekali Pakai", cssFilter: "sepia(0.18) saturate(1.3) contrast(1.08) brightness(1.03)" },
  { id: "VINTAGE_FILM", name: "Film Klasik", cssFilter: "sepia(0.28) saturate(0.78) contrast(0.94) brightness(1.04)" },
  { id: "RETRO", name: "Retro", cssFilter: "sepia(0.12) saturate(1.18) hue-rotate(-12deg) contrast(1.06)" },
  { id: "CLASSIC", name: "Klasik", cssFilter: "grayscale(1) contrast(1.08)" },
] as const;

export type PhotoFilterId = (typeof PHOTO_FILTERS)[number]["id"];

export const PHOTO_FRAMES = [
  { id: "NO_FRAME", name: "Tanpa Bingkai", previewFrameClassName: "bg-charcoal/5 p-0", previewImageClassName: "h-full w-full" },
  { id: "POLAROID_WHITE", name: "Polaroid Putih", previewFrameClassName: "bg-white p-2 pb-5", previewImageClassName: "h-full w-full" },
  { id: "POLAROID_VINTAGE", name: "Polaroid Klasik", previewFrameClassName: "bg-[#eee3cf] p-2 pb-5", previewImageClassName: "h-full w-full" },
  { id: "FILM_FRAME", name: "Bingkai Film", previewFrameClassName: "bg-charcoal p-2", previewImageClassName: "h-full w-full" },
  { id: "MINIMAL_FRAME", name: "Bingkai Minimalis", previewFrameClassName: "border-2 border-beige bg-cream p-1", previewImageClassName: "h-full w-full" },
] as const;

export type PhotoFrameId = (typeof PHOTO_FRAMES)[number]["id"];

export const DEFAULT_PHOTO_EXPERIENCE = {
  filter: "ORIGINAL",
  frame: "NO_FRAME",
} as const satisfies { filter: PhotoFilterId; frame: PhotoFrameId };
