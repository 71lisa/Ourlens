export const PHOTO_FILTERS = [
  { id: "original", name: "Original", cssFilter: "none" },
  { id: "warm", name: "Warm", cssFilter: "sepia(0.14) saturate(1.16) brightness(1.03)" },
  { id: "soft", name: "Soft", cssFilter: "brightness(1.05) contrast(0.92) saturate(0.88)" },
  { id: "vintage", name: "Vintage", cssFilter: "sepia(0.3) contrast(0.9) saturate(0.78)" },
  { id: "film", name: "Film", cssFilter: "contrast(1.12) saturate(0.82) brightness(0.98)" },
  { id: "black-white", name: "Black & White", cssFilter: "grayscale(1)" },
] as const;

export type PhotoFilterId = (typeof PHOTO_FILTERS)[number]["id"];

export const PHOTO_FRAMES = [
  { id: "none", name: "No Frame", kind: "none", previewFrameClassName: "bg-charcoal/5 p-0", previewImageClassName: "h-full w-full" },
  { id: "minimal", name: "Minimal", kind: "minimal", previewFrameClassName: "bg-beige p-1", previewImageClassName: "h-full w-full" },
  { id: "polaroid", name: "Polaroid", kind: "polaroid", previewFrameClassName: "bg-white p-1 pb-3", previewImageClassName: "h-full w-full" },
  { id: "film-strip", name: "Film Strip", kind: "film-strip", previewFrameClassName: "bg-charcoal p-1.5", previewImageClassName: "h-full w-full" },
  { id: "wedding", name: "Wedding", kind: "wedding", previewFrameClassName: "border-2 border-burgundy/70 bg-cream p-1", previewImageClassName: "h-full w-full" },
  { id: "celebration", name: "Celebration", kind: "celebration", previewFrameClassName: "border-2 border-rose bg-cream p-1", previewImageClassName: "h-full w-full" },
] as const;

export type PhotoFrameId = (typeof PHOTO_FRAMES)[number]["id"];