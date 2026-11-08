"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  PHOTO_FILTERS,
  PHOTO_FRAMES,
  type PhotoFilterId,
  type PhotoFrameId,
} from "@/features/memories/media-studio-config";
import { getLocalImageProcessingService } from "@/services/media/image-processing/local-canvas";

export function PhotoExperiencePicker({
  filter,
  frame,
  eventName,
  eventDateLabel,
  onFilterChange,
  onFrameChange,
  filterFieldName,
  frameFieldName,
}: {
  filter: PhotoFilterId;
  frame: PhotoFrameId;
  eventName: string;
  eventDateLabel: string;
  onFilterChange: (value: PhotoFilterId) => void;
  onFrameChange: (value: PhotoFrameId) => void;
  filterFieldName?: string;
  frameFieldName?: string;
}) {
  const [sample, setSample] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const selectedFilter = PHOTO_FILTERS.find((option) => option.id === filter) ?? PHOTO_FILTERS[0];
  const selectedFrame = PHOTO_FRAMES.find((option) => option.id === frame) ?? PHOTO_FRAMES[0];

  useEffect(() => {
    if (!sample) return;

    let active = true;
    let nextUrl = "";
    getLocalImageProcessingService()
      .renderPhoto(sample, {
        filter,
        frame,
        eventName,
        eventDate: eventDateLabel,
        enhanced: false,
      })
      .then((blob) => {
        if (!active) return;
        nextUrl = URL.createObjectURL(blob);
        setPreviewUrl(nextUrl);
        setPreviewError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setPreviewError(error instanceof Error ? error.message : "Pratinjau tidak dapat disiapkan.");
        }
      });

    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [eventDateLabel, eventName, filter, frame, sample]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Filter foto</span>
          <select
            name={filterFieldName}
            value={filter}
            onChange={(event) => {
              const selected = PHOTO_FILTERS.find((option) => option.id === event.target.value);
              if (selected) onFilterChange(selected.id);
            }}
            className="min-h-11 w-full border border-charcoal/15 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
          >
            {PHOTO_FILTERS.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Bingkai foto</span>
          <select
            name={frameFieldName}
            value={frame}
            onChange={(event) => {
              const selected = PHOTO_FRAMES.find((option) => option.id === event.target.value);
              if (selected) onFrameChange(selected.id);
            }}
            className="min-h-11 w-full border border-charcoal/15 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
          >
            {PHOTO_FRAMES.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Coba pratinjau dengan foto (opsional)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setSample(event.currentTarget.files?.[0] ?? null);
              setPreviewUrl("");
              setPreviewError("");
            }}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:border-0 file:bg-cream-deep file:px-3"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-charcoal/55">Pratinjau tampilan foto</p>
        <div className="flex min-h-64 items-center justify-center overflow-hidden border border-charcoal/10 bg-cream-deep">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt={`${selectedFilter.name} dengan frame ${selectedFrame.name}`}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[28rem] w-full object-contain"
            />
          ) : (
            <div
              className={cn(
                "w-full max-w-sm p-6 text-center",
                frame === "POLAROID_WHITE" && "bg-white",
                frame === "POLAROID_VINTAGE" && "bg-[#eee3cf]",
                frame === "FILM_FRAME" && "bg-charcoal",
                frame === "MINIMAL_FRAME" && "border-2 border-beige bg-cream",
              )}
            >
              <div
                className={cn(
                  "relative mx-auto flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-rose/70 via-beige to-burgundy/30",
                  frame === "FILM_FRAME" && "mx-[8%] w-[84%]",
                )}
                style={{ filter: selectedFilter.cssFilter }}
              >
                <span className="font-display text-4xl text-charcoal/60">OurLens</span>
                {frame === "FILM_FRAME" ? (
                  <>
                    <span aria-hidden className="absolute inset-y-0 left-[-10%] w-[12%] bg-[radial-gradient(ellipse_at_center,#e7d6b7_35%,transparent_38%)] bg-[length:100%_20%]" />
                    <span aria-hidden className="absolute inset-y-0 right-[-10%] w-[12%] bg-[radial-gradient(ellipse_at_center,#e7d6b7_35%,transparent_38%)] bg-[length:100%_20%]" />
                  </>
                ) : null}
              </div>
              {frame !== "NO_FRAME" ? (
                <div className={cn("mt-3", frame === "FILM_FRAME" && "text-cream")}>
                  <p className="truncate font-display text-lg">{eventName || "Nama acara"}</p>
                  <p className={cn("text-xs text-charcoal/65", frame === "FILM_FRAME" && "text-cream/70")}>
                    {eventDateLabel || "Tanggal acara"}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {previewError ? <p role="alert" className="text-sm text-burgundy">{previewError}</p> : null}
        <p className="text-xs text-charcoal/55">
          {selectedFilter.name} · {selectedFrame.name}
          {frame === "NO_FRAME" ? " · Tanpa tulisan acara" : ` · ${eventName || "Nama acara"} · ${eventDateLabel || "Tanggal acara"}`}
        </p>
      </div>
    </div>
  );
}
