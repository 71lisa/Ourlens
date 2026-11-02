"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  hasAllowedMediaExtension,
  MAX_VIDEO_UPLOAD_BYTES,
} from "@/lib/media/file-validation";

const maxVideoSizeLabel = `${MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024} MB`;

type LiveMomentProps = {
  onSubmit: (media: File, caption: string, previewUrl: string) => void;
  onRetake: () => void;
};

export function LiveMomentCapture({ onSubmit, onRetake }: LiveMomentProps) {
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const previewTransferred = useRef(false);
  useEffect(() => () => {
    if (videoUrl && !previewTransferred.current) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function chooseVideo(file: File | undefined) {
    if (!file) {
      setError("");
      return;
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_UPLOAD_BYTES) {
      setError(file.size <= 0 ? "The selected video is empty." : `Choose a short video smaller than ${maxVideoSizeLabel}.`);
      return;
    }
    if (
      !["video/mp4", "video/quicktime"].includes(file.type.toLowerCase()) ||
      !hasAllowedMediaExtension(file.name, file.type.toLowerCase(), "video")
    ) {
      setError("Choose an MP4 or MOV video.");
      return;
    }
    let nextVideoUrl: string;
    try {
      nextVideoUrl = URL.createObjectURL(file);
    } catch {
      setError("This video could not be previewed. Please choose another file.");
      return;
    }
    setVideoFile(file);
    setVideoUrl(nextVideoUrl);
    setError("");
  }

  function retake() {
    setVideoFile(null);
    setVideoUrl("");
    setCaption("");
    setError("");
    onRetake();
  }

  return (
    <div className="space-y-5 border-y border-charcoal/10 py-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Live moment</p>
        <h2 className="mt-1 font-display text-2xl">Share a short moving memory.</h2>
      </div>
      {videoUrl && videoFile ? (
        <div className="space-y-3">
          <video controls playsInline preload="metadata" src={videoUrl} className="max-h-[55vh] w-full rounded-md bg-charcoal/5" />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Add a note <span className="font-normal text-charcoal/50">(optional)</span></span>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 300))} rows={3} maxLength={300} className="w-full border border-charcoal/15 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy" placeholder="A quick moving memory…" />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              onClick={() => {
                previewTransferred.current = true;
                onSubmit(videoFile, caption, videoUrl);
              }}
            >
              Use This Live Moment
            </Button>
            <Button type="button" variant="ghost" onClick={retake}>Choose another video</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="relative inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md bg-burgundy px-6 text-sm font-medium text-cream transition-colors hover:bg-burgundy-deep focus-within:outline-none focus-within:ring-2 focus-within:ring-burgundy focus-within:ring-offset-2 focus-within:ring-offset-cream">
              Use camera
              <input
                className="cursor-pointer"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 1 }}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                capture="environment"
                aria-label="Choose a video from camera"
                onChange={(event) => {
                  chooseVideo(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="relative inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md border border-burgundy bg-transparent px-6 text-sm font-medium text-burgundy transition-colors hover:bg-burgundy/5 focus-within:outline-none focus-within:ring-2 focus-within:ring-burgundy focus-within:ring-offset-2 focus-within:ring-offset-cream">
              Choose video
              <input
                className="cursor-pointer"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 1 }}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                aria-label="Choose a video from gallery"
                onChange={(event) => {
                  chooseVideo(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-xs text-charcoal/55">Up to {maxVideoSizeLabel} · MP4 or MOV · camera capture uses your device&apos;s native picker</p>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-burgundy">{error}</p> : null}
    </div>
  );
}
