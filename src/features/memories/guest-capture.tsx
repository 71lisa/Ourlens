"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  detectPhotoMimeType,
  hasAllowedMediaExtension,
  MAX_PHOTO_UPLOAD_BYTES,
  validatePhotoPayload,
} from "@/lib/media/file-validation";
import { EventChallengeSelector, type EventChallengePrompt } from "@/features/events/challenge";
import { MediaStudio } from "./media-studio";
import { LiveMomentCapture } from "./live-moment";

const maxPhotoSizeLabel = `${MAX_PHOTO_UPLOAD_BYTES / 1024 / 1024} MB`;

type GuestCaptureProps = { slug: string; challengePrompts?: EventChallengePrompt[] };

function readPhotoBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("This photo could not be read. Please choose another image."));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(new Error("This photo could not be read. Please choose another image."));
    reader.onabort = () => reject(new Error("Reading this photo was cancelled. Please choose it again."));
    reader.readAsArrayBuffer(file);
  });
}

export function GuestCapture({ slug, challengePrompts = [] }: GuestCaptureProps) {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [original, setOriginal] = useState<File | null>(null);
  const [edited, setEdited] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [editedPreviewUrl, setEditedPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [stage, setStage] = useState<"select" | "studio" | "caption">("select");
  const [kind, setKind] = useState<"photo" | "video">("photo");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const uploadLock = useRef(false);
  const photoSelectionId = useRef(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/events/${encodeURIComponent(slug)}/guest-session`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("We couldn’t start your guest session. Refresh and try again.");
        if (active) setSessionReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setSessionError(reason instanceof Error ? reason.message : "Please refresh and try again.");
      });
    return () => { active = false; };
  }, [slug, sessionAttempt]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (editedPreviewUrl) URL.revokeObjectURL(editedPreviewUrl);
  }, [editedPreviewUrl]);

  async function chooseFile(selected: File | undefined) {
    const selectionId = ++photoSelectionId.current;
    if (!selected) {
      setPhotoPreparing(false);
      setError("");
      return;
    }
    setError("");
    setSuccess(false);
    if (selected.size <= 0 || selected.size > MAX_PHOTO_UPLOAD_BYTES) {
      setPhotoPreparing(false);
      setError(selected.size <= 0 ? "The selected photo is empty." : `Choose a photo smaller than ${maxPhotoSizeLabel}.`);
      return;
    }
    setPhotoPreparing(true);
    try {
      const bytes = await readPhotoBytes(selected);
      const detectedMimeType = detectPhotoMimeType(bytes);
      if (!detectedMimeType) {
        throw new Error("This photo format isn’t supported. Choose a JPG, PNG, or WebP image.");
      }

      const validation = validatePhotoPayload({
        bytes,
        mimeType: detectedMimeType,
        fileSize: selected.size,
      });
      if (!validation.ok) throw new Error(validation.error);
      if (selectionId !== photoSelectionId.current) return;

      const extension = detectedMimeType === "image/jpeg"
        ? ".jpg"
        : detectedMimeType === "image/png" ? ".png" : ".webp";
      const expectedName = selected.name.replace(/\.[^.]*$/, "") + extension;
      const normalizedFile = selected.type.toLowerCase() === detectedMimeType &&
        hasAllowedMediaExtension(selected.name, detectedMimeType, "photo")
        ? selected
        : new File([selected.slice(0, selected.size, detectedMimeType)], expectedName, { type: detectedMimeType });
      const nextPreviewUrl = URL.createObjectURL(normalizedFile);
      setOriginal(normalizedFile);
      setEdited(null);
      setIdempotencyKey(crypto.randomUUID());
      setPreviewUrl(nextPreviewUrl);
      setEditedPreviewUrl("");
      setStage("studio");
    } catch (reason) {
      if (selectionId === photoSelectionId.current) {
        setError(reason instanceof Error
          ? reason.message
          : "This photo could not be prepared. Please choose another image.");
      }
    } finally {
      if (selectionId === photoSelectionId.current) setPhotoPreparing(false);
    }
  }

  function retake() {
    photoSelectionId.current += 1;
    setPhotoPreparing(false);
    setOriginal(null);
    setEdited(null);
    setPreviewUrl("");
    setEditedPreviewUrl("");
    setCaption("");
    setIdempotencyKey("");
    setError("");
    setStage("select");
  }

  async function upload(mediaOverride?: File, captionOverride = caption) {
    const mediaToUpload = mediaOverride ?? edited;
    if (!original || !mediaToUpload || !idempotencyKey || uploadLock.current || !sessionReady) return;
    uploadLock.current = true;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("kind", kind);
    body.set(kind, mediaToUpload);
    if (kind === "photo") body.set("original", original);
    body.set("idempotencyKey", idempotencyKey);
    body.set("caption", captionOverride);
    if (selectedChallengeId) {
      body.set("challengeId", selectedChallengeId);
    }
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/memories`, {
        method: "POST",
        body,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "We couldn’t upload this memory. Please try again.");
      setSuccess(true);
      setOriginal(null);
      setEdited(null);
      setPreviewUrl("");
      setEditedPreviewUrl("");
      setCaption("");
      setIdempotencyKey("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t upload this memory. Please try again.");
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="border-y border-charcoal/10 py-8 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-burgundy">A moment, added</p>
        <h2 className="mt-2 font-display text-3xl">Memory captured!</h2>
        <p className="mt-2 text-sm text-charcoal/70">Thank you for adding your perspective. Your memory will appear in the gallery after review.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/e/${encodeURIComponent(slug)}/gallery`} className={cn(buttonVariants())}>View Gallery</Link>
          <Button variant="outline" onClick={() => { setSuccess(false); retake(); }}>Capture Another</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-y border-charcoal/10 py-7">
      <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Your perspective</p>
      <h2 className="mt-2 font-display text-2xl">Choose a memory type</h2>
      <div id="capture-options" className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant={kind === "photo" ? "primary" : "outline"} size="sm" onClick={() => { retake(); setKind("photo"); }}>Photo</Button>
        <Button type="button" variant={kind === "video" ? "primary" : "outline"} size="sm" onClick={() => { retake(); setKind("video"); }}>Live Moment</Button>
      </div>
      {sessionError ? <p role="alert" className="mt-4 text-sm text-burgundy">{sessionError}</p> : null}
      {sessionError ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setSessionReady(false);
            setSessionError("");
            setSessionAttempt((attempt) => attempt + 1);
          }}
        >
          Retry guest session
        </Button>
      ) : null}
      {stage === "studio" && original && previewUrl ? (
        <div className="mt-5">
          <MediaStudio
            original={original}
            previewUrl={previewUrl}
            caption={caption}
            onCaptionChange={setCaption}
            challengePrompts={challengePrompts}
            selectedChallengeId={selectedChallengeId}
            onChallengeChange={setSelectedChallengeId}
            sessionReady={sessionReady}
            busy={busy}
            onShare={async (photo, photoCaption) => {
              setEdited(photo);
              await upload(photo, photoCaption);
            }}
            onRetake={retake}
          />
        </div>
      ) : null}

      {stage === "caption" && original && edited && editedPreviewUrl ? (
        <div className="mt-5 space-y-4">
          <div className="overflow-hidden border border-charcoal/10 bg-white">
            {kind === "video" ? (
              <video
                src={editedPreviewUrl}
                controls
                playsInline
                preload="metadata"
                className="max-h-[55vh] w-full bg-charcoal/5"
              />
            ) : (
              <Image src={editedPreviewUrl} alt="Final edited photo" width={1200} height={900} unoptimized className="max-h-[55vh] w-full bg-charcoal/5 object-contain" />
            )}
            <p className="px-3 py-2 text-xs uppercase tracking-[0.14em] text-charcoal/55">
              {kind === "video" ? "Live Moment video" : "Edited photo · original preserved"}
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Add a note <span className="font-normal text-charcoal/50">(optional)</span></span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              placeholder="Best day ever…"
              className="w-full border border-charcoal/15 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
            />
            <span className="block text-right text-xs text-charcoal/50">{caption.length}/300</span>
          </label>
          {challengePrompts.length ? (
            <EventChallengeSelector prompts={challengePrompts} value={selectedChallengeId} onChange={setSelectedChallengeId} />
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" size="lg" onClick={() => upload()} disabled={busy || !sessionReady || !edited}>
              {busy ? "Uploading your memory…" : !sessionReady ? "Preparing guest session…" : "Share Memory"}
            </Button>
            {kind === "photo" ? <Button type="button" variant="ghost" onClick={() => setStage("studio")} disabled={busy}>Edit Photo</Button> : null}
            <Button type="button" variant="ghost" onClick={retake} disabled={busy}>Retake</Button>
          </div>
        </div>
      ) : null}

      {stage === "select" ? (
        kind === "photo" ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className={cn(buttonVariants({ size: "lg" }), "relative cursor-pointer overflow-hidden")}>
              Use camera
              <input
                className="cursor-pointer"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 1 }}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Choose a photo from camera"
                onChange={(event) => {
                  chooseFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className={cn(buttonVariants({ variant: "outline", size: "lg" }), "relative cursor-pointer overflow-hidden")}>
              Choose from gallery
              <input
                className="cursor-pointer"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 1 }}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                aria-label="Choose a photo from gallery"
                onChange={(event) => {
                  chooseFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="text-xs text-charcoal/55 sm:col-span-2">JPG, PNG, or WebP · up to {maxPhotoSizeLabel}</p>
            {photoPreparing ? (
              <p role="status" className="text-sm text-charcoal/65 sm:col-span-2">
                Preparing your photo preview…
              </p>
            ) : null}
            {error ? <p role="alert" className="text-sm text-burgundy sm:col-span-2">{error}</p> : null}
          </div>
        ) : (
          <div className="mt-5">
            <LiveMomentCapture
              onSubmit={(video, videoCaption, videoPreviewUrl) => {
                setOriginal(video);
                setEdited(video);
                setIdempotencyKey(crypto.randomUUID());
                setCaption(videoCaption);
                setEditedPreviewUrl(videoPreviewUrl);
                setStage("caption");
              }}
              onRetake={() => {
                setOriginal(null);
                setEdited(null);
                setEditedPreviewUrl("");
                setCaption("");
                setIdempotencyKey("");
                setStage("select");
              }}
            />
          </div>
        )
      ) : null}
      {busy ? (
        <div className="mt-4 space-y-2" role="status">
          <p className="text-sm text-charcoal/65">Uploading securely. Keep this page open for a moment.</p>
          <div
            role="progressbar"
            aria-label="Memory upload"
            aria-valuetext="Upload in progress"
            className="h-1 overflow-hidden rounded bg-charcoal/10"
          >
            <div className="h-full w-1/3 animate-pulse rounded bg-burgundy" />
          </div>
        </div>
      ) : null}
      {error && stage !== "select" ? <p role="alert" className="mt-4 text-sm text-burgundy">{error}</p> : null}
      {!sessionReady && !sessionError ? <p role="status" className="mt-4 text-sm text-charcoal/55">Getting your guest space ready…</p> : null}
    </div>
  );
}