"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { validatePhotoPayload } from "@/lib/media/file-validation";
import { getLocalImageProcessingService } from "@/services/media/image-processing/local-canvas";
import { PHOTO_FILTERS, PHOTO_FRAMES, type PhotoFilterId, type PhotoFrameId } from "./media-studio-config";
import { EventChallengeSelector, type EventChallengePrompt } from "@/features/events/challenge";

type StudioPanel = "filter" | "frame" | "enhance";

export function MediaStudio({
  original,
  previewUrl,
  caption,
  onCaptionChange,
  challengePrompts,
  selectedChallengeId,
  onChallengeChange,
  sessionReady,
  busy,
  onShare,
  onRetake,
}: {
  original: File;
  previewUrl: string;
  caption: string;
  onCaptionChange: (caption: string) => void;
  challengePrompts: EventChallengePrompt[];
  selectedChallengeId: string | null;
  onChallengeChange: (challengeId: string | null) => void;
  sessionReady: boolean;
  busy: boolean;
  onShare: (editedPhoto: File, caption: string) => Promise<void>;
  onRetake: () => void;
}) {
  const [filter, setFilter] = useState<PhotoFilterId>("original");
  const [frame, setFrame] = useState<PhotoFrameId>("none");
  const [enhanced, setEnhanced] = useState(false);
  const [panel, setPanel] = useState<StudioPanel>("filter");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const selectedFilter = PHOTO_FILTERS.find((item) => item.id === filter) ?? PHOTO_FILTERS[0];
  const selectedFrame = PHOTO_FRAMES.find((item) => item.id === frame) ?? PHOTO_FRAMES[0];

  function resetEdits() {
    setFilter("original");
    setFrame("none");
    setEnhanced(false);
    setPanel("filter");
    setError("");
  }

  async function sharePhoto() {
    if (processing || busy || !sessionReady) return;
    setProcessing(true);
    setError("");
    try {
      const blob = await getLocalImageProcessingService().renderPhoto(original, {
        filter,
        frame,
        enhanced,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const validation = validatePhotoPayload({ bytes, mimeType: blob.type, fileSize: blob.size });
      if (!validation.ok) throw new Error(validation.error);
      await onShare(new File([blob], "ourlens-edited-memory.jpg", { type: validation.mimeType }), caption);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This photo could not be prepared. Try another image.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="space-y-5" aria-label="Media Studio">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-burgundy">OurLens · Media Studio</p>
          <h2 className="mt-1 font-display text-2xl">Make it yours.</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={resetEdits}>Reset</Button>
      </div>

      <div className="mx-auto w-full max-w-xl">
        <div className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden", selectedFrame.previewFrameClassName)}>
          <Image
            src={previewUrl}
            alt="Photo edit preview"
            width={1200}
            height={900}
            unoptimized
            className={cn("object-contain", selectedFrame.previewImageClassName)}
            style={{ filter: `${selectedFilter.cssFilter}${enhanced ? " brightness(1.06) contrast(1.1) saturate(1.08)" : ""}` }}
          />
          {frame === "film-strip" ? (
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex w-[9%] flex-col justify-around py-1">
              {[0, 1, 2, 3, 4].map((hole) => <span key={hole} className="mx-auto h-2 w-3/5 bg-beige" />)}
            </div>
          ) : null}
          {frame === "film-strip" ? (
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-[9%] flex-col justify-around py-1">
              {[0, 1, 2, 3, 4].map((hole) => <span key={hole} className="mx-auto h-2 w-3/5 bg-beige" />)}
            </div>
          ) : null}
          {frame === "wedding" ? <span aria-hidden className="pointer-events-none absolute inset-[5%] border border-beige" /> : null}
          {frame === "celebration" ? <span aria-hidden className="pointer-events-none absolute inset-[5%] border border-burgundy/35" /> : null}
        </div>
      </div>

      <div className="border-y border-charcoal/10">
        <div role="tablist" aria-label="Photo treatments" className="grid grid-cols-3 border-b border-charcoal/10">
          {(["filter", "frame", "enhance"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={panel === item}
              onClick={() => setPanel(item)}
              className={cn("min-h-12 border-b-2 px-3 text-xs font-medium uppercase tracking-[0.16em]", panel === item ? "border-burgundy text-burgundy" : "border-transparent text-charcoal/55")}
            >
              {item}
            </button>
          ))}
        </div>

        {panel === "filter" ? (
          <div className="flex gap-3 overflow-x-auto py-4" role="group" aria-label="Choose a filter">
            {PHOTO_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className="w-[4.75rem] shrink-0 text-center"
              >
                <span className={cn("block aspect-square overflow-hidden border-2 bg-cream", filter === item.id ? "border-burgundy" : "border-transparent")}>
                  <Image src={previewUrl} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" style={{ filter: item.cssFilter }} />
                </span>
                <span className={cn("mt-1 block text-xs", filter === item.id ? "font-semibold text-burgundy" : "text-charcoal/70")}>{item.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {panel === "frame" ? (
          <div className="flex gap-3 overflow-x-auto py-4" role="group" aria-label="Choose a frame">
            {PHOTO_FRAMES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={frame === item.id}
                onClick={() => setFrame(item.id)}
                className="w-[4.75rem] shrink-0 text-center"
              >
                <span className={cn("block aspect-square border-2 p-0.5", frame === item.id ? "border-burgundy" : "border-transparent")}>
                  <span className={cn("block h-full w-full overflow-hidden", item.previewFrameClassName)}>
                    <Image src={previewUrl} alt="" width={80} height={80} unoptimized className={cn("h-full w-full object-cover", item.previewImageClassName)} />
                  </span>
                </span>
                <span className={cn("mt-1 block text-xs", frame === item.id ? "font-semibold text-burgundy" : "text-charcoal/70")}>{item.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {panel === "enhance" ? (
          <div className="space-y-3 py-4">
            <div className="flex gap-2" role="group" aria-label="Enhancement preview">
              <Button type="button" size="sm" variant={!enhanced ? "primary" : "outline"} aria-pressed={!enhanced} onClick={() => setEnhanced(false)}>Original</Button>
              <Button type="button" size="sm" variant={enhanced ? "primary" : "outline"} aria-pressed={enhanced} onClick={() => setEnhanced(true)}>Enhanced</Button>
            </div>
            <p className="text-xs text-charcoal/60">A local brightness, contrast, and color adjustment. No AI service is used.</p>
          </div>
        ) : null}
      </div>

      {error ? <p role="alert" className="text-sm text-burgundy">{error}</p> : null}
      {processing ? <p role="status" className="text-sm text-charcoal/65">Preparing your edited photo…</p> : null}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Add a note <span className="font-normal text-charcoal/50">(optional)</span></span>
        <textarea
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value.slice(0, 300))}
          maxLength={300}
          rows={3}
          placeholder="Best day ever…"
          className="w-full border border-charcoal/15 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
        />
        <span className="block text-right text-xs text-charcoal/50">{caption.length}/300</span>
      </label>
      {challengePrompts.length ? (
        <EventChallengeSelector prompts={challengePrompts} value={selectedChallengeId} onChange={onChallengeChange} />
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onRetake} disabled={processing || busy}>Retake</Button>
        <Button type="button" size="lg" onClick={sharePhoto} disabled={processing || busy || !sessionReady}>
          {busy ? "Uploading your memory…" : processing ? "Preparing…" : !sessionReady ? "Preparing guest session…" : "Share Memory"}
        </Button>
      </div>
    </section>
  );
}