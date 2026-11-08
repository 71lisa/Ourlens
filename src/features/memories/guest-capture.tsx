"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { EventChallengeSelector, type EventChallengePrompt } from "@/features/events/challenge";
import {
  type PhotoFilterId,
  type PhotoFrameId,
} from "./media-studio-config";
import { getLocalImageProcessingService } from "@/services/media/image-processing/local-canvas";
import { MAX_SOURCE_PHOTO_BYTES, normalizeGuestPhoto } from "./normalize-guest-photo";

function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type GuestCaptureProps = {
  slug: string;
  eventName: string;
  eventDateLabel: string;
  filter: PhotoFilterId;
  frame: PhotoFrameId;
  galleryAvailable: boolean;
  challengePrompts?: EventChallengePrompt[];
};

type PhotoQuota = {
  scope: "guest" | "event";
  uploaded: number;
  limit: number;
  remaining: number;
  participantCount: number | null;
  participantLimit: number | null;
  canUpload: boolean;
};

export function GuestCapture({
  slug,
  eventName,
  eventDateLabel,
  filter,
  frame,
  galleryAvailable,
  challengePrompts = [],
}: GuestCaptureProps) {
  const router = useRouter();
  const refresh = router.refresh;
  const [sessionReady, setSessionReady] = useState(false);
  const [nameRequired, setNameRequired] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [photoQuota, setPhotoQuota] = useState<PhotoQuota | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [original, setOriginal] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const uploadLock = useRef(false);
  const photoSelectionId = useRef(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    fetch(`/api/events/${encodeURIComponent(slug)}/guest-session`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error ?? "Sesi tamu tidak dapat dimulai. Muat ulang halaman dan coba lagi.");
        }
        const result = await response.json() as {
          nameRequired?: boolean;
          displayName?: string | null;
          photoQuota?: PhotoQuota;
        };
        if (result.nameRequired) {
          if (active) setNameRequired(true);
          return;
        }
        if (!result.photoQuota) throw new Error("Informasi kuota foto tidak tersedia. Muat ulang halaman untuk mencoba lagi.");
        if (active && result.displayName) setGuestName(result.displayName);
        if (active) setPhotoQuota(result.photoQuota);
        if (active) {
          setSessionReady(true);
          refresh();
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setSessionError(reason instanceof DOMException && reason.name === "AbortError"
          ? "Sesi tamu terlalu lama dimulai. Periksa koneksi internet dan coba lagi."
          : reason instanceof Error
            ? reason.message
            : "Sesi tamu tidak dapat dimulai. Periksa koneksi internet dan coba lagi.");
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [slug, refresh, sessionAttempt]);

  async function submitGuestName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = guestName.trim();
    if (!displayName || nameSubmitting) return;

    setNameSubmitting(true);
    setSessionError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/guest-session`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const result = await response.json() as {
        error?: string;
        nameRequired?: boolean;
        displayName?: string | null;
        photoQuota?: PhotoQuota;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Kami belum bisa membuka ruang acara. Silakan coba lagi.");
      }
      if (result.nameRequired || !result.photoQuota) {
        throw new Error("Nama belum tersimpan. Periksa nama dan coba lagi.");
      }
      setGuestName(result.displayName || displayName);
      setPhotoQuota(result.photoQuota);
      setNameRequired(false);
      setSessionReady(true);
      refresh();
    } catch (reason) {
      setSessionError(reason instanceof Error
        ? reason.message
        : "Kami belum bisa membuka ruang acara. Silakan coba lagi.");
    } finally {
      setNameSubmitting(false);
    }
  }

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
  }, [selectedPhotoUrl]);

  async function choosePhoto(selected: File | undefined) {
    const selectionId = ++photoSelectionId.current;
    if (!selected) return;
    setError("");
    setSuccess(false);
    setOriginal(null);
    setPreviewUrl("");
    setSelectedPhotoUrl("");
    setIdempotencyKey("");
    setCaption("");
    setSelectedChallengeId(null);
    if (selected.size <= 0 || selected.size > MAX_SOURCE_PHOTO_BYTES) {
      setPhotoPreparing(false);
      setError(selected.size <= 0
        ? "Foto yang dipilih kosong."
        : "Ukuran foto terlalu besar untuk diproses. Pilih foto yang lebih kecil dari 32 MB.");
      return;
    }

    setPhotoPreparing(true);
    setSelectedPhotoUrl(URL.createObjectURL(selected));
    try {
      const normalizedFile = await normalizeGuestPhoto(selected);
      if (selectionId !== photoSelectionId.current) return;
      const preview = await getLocalImageProcessingService().renderPhoto(normalizedFile, {
        filter,
        frame,
        eventName,
        eventDate: eventDateLabel,
        enhanced: false,
      });
      if (selectionId !== photoSelectionId.current) return;

      setOriginal(normalizedFile);
      setPreviewUrl(URL.createObjectURL(preview));
      setIdempotencyKey(createIdempotencyKey());
      setCaption("");
      setSelectedChallengeId(null);
    } catch (reason) {
      if (selectionId === photoSelectionId.current) {
        setError(reason instanceof Error ? reason.message : "Foto tidak dapat disiapkan. Pilih foto lain.");
      }
    } finally {
      if (selectionId === photoSelectionId.current) setPhotoPreparing(false);
    }
  }

  function retake() {
    photoSelectionId.current += 1;
    setPhotoPreparing(false);
    setOriginal(null);
    setSelectedPhotoUrl("");
    setPreviewUrl("");
    setCaption("");
    setSelectedChallengeId(null);
    setIdempotencyKey("");
    setError("");
  }

  async function upload() {
    if (!original || !idempotencyKey || uploadLock.current || !sessionReady) return;
    uploadLock.current = true;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("kind", "photo");
    body.set("photo", original);
    body.set("idempotencyKey", idempotencyKey);
    body.set("caption", caption);
    if (selectedChallengeId) body.set("challengeId", selectedChallengeId);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/memories`, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const result = await response.json() as { error?: string; photoQuota?: PhotoQuota };
      if (!response.ok) throw new Error(result.error ?? "Foto tidak dapat diunggah. Silakan coba lagi.");
      if (result.photoQuota) setPhotoQuota(result.photoQuota);
      retake();
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Foto tidak dapat diunggah. Silakan coba lagi.");
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  }

  const quotaNotice = photoQuota ? (
    <div className="mt-4 rounded-xl border border-burgundy/15 bg-rose/10 p-4 text-sm text-charcoal/75" aria-live="polite">
      <p className="font-semibold text-charcoal">
        Foto yang sudah diunggah: {photoQuota.uploaded}/{photoQuota.limit}
        {photoQuota.scope === "event" ? " · batas total uji coba gratis" : ""}
      </p>
      {photoQuota.remaining > 0 ? (
        <p className="mt-1">Kamu masih bisa mengunggah {photoQuota.remaining} foto lagi.</p>
      ) : photoQuota.scope === "event" ? (
        <p className="mt-1 text-burgundy">Batas maksimal uji coba gratis sebanyak {photoQuota.limit} foto telah tercapai.</p>
      ) : (
        <p className="mt-1 text-burgundy">Batas unggah 20 foto telah tercapai.</p>
      )}
      {photoQuota.scope === "guest" && photoQuota.participantLimit !== null ? (
        <p className="mt-2 text-xs">
          Tamu yang sudah mengunggah: {photoQuota.participantCount}/{photoQuota.participantLimit}
        </p>
      ) : null}
      {!photoQuota.canUpload && photoQuota.remaining > 0 && photoQuota.scope === "guest" ? (
        <p className="mt-1 text-burgundy">Kapasitas tamu acara sudah penuh. Tamu baru tidak dapat mengunggah foto.</p>
      ) : null}
    </div>
  ) : null;

  if (success) {
    return (
      <div className="py-5 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-burgundy">Momen terkirim</p>
        <h2 className="mt-2 font-display text-3xl text-charcoal">Foto kamu sudah masuk ke galeri.</h2>
        <p className="mt-2 text-sm text-charcoal/70">Terima kasih sudah berbagi momen.</p>
        <div className="mx-auto max-w-xl text-left">{quotaNotice}</div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {galleryAvailable ? (
            <Link href={`/e/${encodeURIComponent(slug)}/gallery`} className={cn(buttonVariants())}>Lihat Galeri</Link>
          ) : null}
          {photoQuota?.canUpload ? (
            <Button variant="outline" onClick={() => setSuccess(false)}>Unggah foto lainnya</Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div id="capture-options" className="scroll-mt-8 py-5">
      <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Bagikan momen</p>
      <h2 className="mt-2 font-display text-2xl text-charcoal">Abadikan momen di {eventName}.</h2>
      <p className="mt-2 text-sm text-charcoal/65">Tidak perlu membuat akun. Gaya foto acara akan diterapkan otomatis.</p>
      {quotaNotice}

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
          Coba mulai sesi lagi
        </Button>
      ) : null}

      {nameRequired ? (
        <form onSubmit={submitGuestName} className="mt-6 rounded-2xl border border-charcoal/10 bg-cream p-4 sm:p-5">
          <label htmlFor="guest-display-name" className="block text-sm font-medium text-charcoal">
            Masukkan nama sebelum berbagi foto
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="guest-display-name"
              name="displayName"
              type="text"
              autoComplete="name"
              maxLength={60}
              required
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Nama kamu"
              className="min-w-0 flex-1 rounded-xl border border-charcoal/15 bg-white px-4 py-3 text-base text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
            />
            <Button type="submit" size="lg" disabled={nameSubmitting || !guestName.trim()}>
              {nameSubmitting ? "Menyiapkan..." : "Lanjutkan"}
            </Button>
          </div>
        </form>
      ) : null}

      {!nameRequired && !original ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className={cn(
            buttonVariants({ size: "lg" }),
            "relative w-full cursor-pointer overflow-hidden",
            (!sessionReady || photoQuota?.canUpload === false) && "cursor-not-allowed opacity-60",
          )}>
            Gunakan kamera
            <input
              className="cursor-pointer"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 1 }}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Pilih foto dari kamera"
              disabled={!sessionReady || photoQuota?.canUpload === false || photoPreparing || busy}
              onChange={(event) => {
                void choosePhoto(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "relative w-full cursor-pointer overflow-hidden",
            (!sessionReady || photoQuota?.canUpload === false) && "cursor-not-allowed opacity-60",
          )}>
            Pilih dari galeri
            <input
              className="cursor-pointer"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 1 }}
              type="file"
              accept="image/*"
              aria-label="Pilih foto dari galeri"
              disabled={!sessionReady || photoQuota?.canUpload === false || photoPreparing || busy}
              onChange={(event) => {
                void choosePhoto(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="text-xs text-charcoal/55 sm:col-span-2">Foto maksimal 32 MB. Tampilan foto akan disiapkan otomatis.</p>
        </div>
      ) : null}

      {photoPreparing ? <p role="status" className="mt-4 text-sm text-charcoal/65">Menyiapkan pratinjau foto…</p> : null}
      {selectedPhotoUrl ? (
        <div className="mt-5 space-y-4">
          <div className="overflow-hidden rounded-xl border border-charcoal/10 bg-white">
            <Image
              src={previewUrl || selectedPhotoUrl}
              alt={`Pratinjau foto dengan filter ${PHOTO_FILTERS_LABELS[filter]} dan bingkai ${PHOTO_FRAMES_LABELS[frame]}`}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[55vh] w-full bg-charcoal/5 object-contain"
            />
            <p className="px-3 py-2 text-xs uppercase tracking-[0.14em] text-charcoal/55">
              {previewUrl
                ? "Pratinjau gaya acara otomatis · foto asli tetap tersimpan terpisah"
                : photoPreparing
                  ? "Menyiapkan pratinjau foto…"
                  : "Foto terpilih"}
            </p>
          </div>
          {original ? <label className="block space-y-1.5">
            <span className="text-sm font-medium">Keterangan <span className="font-normal text-charcoal/50">(opsional)</span></span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              placeholder="Momen yang ingin dikenang…"
              className="w-full rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-base text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
            />
            <span className="block text-right text-xs text-charcoal/50">{caption.length}/300</span>
          </label> : null}
          {original && challengePrompts.length ? (
            <EventChallengeSelector prompts={challengePrompts} value={selectedChallengeId} onChange={setSelectedChallengeId} />
          ) : null}
          {original ? <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="primary" size="lg" onClick={() => void upload()} disabled={busy || photoPreparing || !sessionReady || photoQuota?.canUpload === false || !idempotencyKey}>
              {busy ? "Mengunggah foto…" : !sessionReady ? "Menyiapkan sesi tamu…" : "Unggah Foto"}
            </Button>
            <Button type="button" variant="ghost" onClick={retake} disabled={busy}>Pilih foto lain</Button>
          </div> : null}
        </div>
      ) : null}

      {busy ? (
        <div className="mt-4 space-y-2" role="status">
          <p className="text-sm text-charcoal/65">Foto sedang diunggah dengan aman. Biarkan halaman ini tetap terbuka.</p>
          <div role="progressbar" aria-label="Pengunggahan foto" aria-valuetext="Pengunggahan sedang berlangsung" className="h-1 overflow-hidden rounded bg-charcoal/10">
            <div className="h-full w-1/3 animate-pulse rounded bg-burgundy" />
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-4 text-sm text-burgundy">{error}</p> : null}
      {!sessionReady && !sessionError ? <p role="status" className="mt-4 text-sm text-charcoal/55">Menyiapkan ruang tamu…</p> : null}
    </div>
  );
}

const PHOTO_FILTERS_LABELS = {
  ORIGINAL: "Asli",
  DISPOSABLE_CAM: "Kamera Sekali Pakai",
  VINTAGE_FILM: "Film Klasik",
  RETRO: "Retro",
  CLASSIC: "Klasik",
} satisfies Record<PhotoFilterId, string>;

const PHOTO_FRAMES_LABELS = {
  NO_FRAME: "Tanpa Bingkai",
  POLAROID_WHITE: "Polaroid Putih",
  POLAROID_VINTAGE: "Polaroid Klasik",
  FILM_FRAME: "Bingkai Film",
  MINIMAL_FRAME: "Bingkai Minimalis",
} satisfies Record<PhotoFrameId, string>;
