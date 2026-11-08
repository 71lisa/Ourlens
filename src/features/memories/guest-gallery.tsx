"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Download, Eye, Trash2, X } from "lucide-react";

export type GuestGalleryAsset = {
  id: string;
  type: "PHOTO" | "VIDEO";
  caption: string | null;
  uploaderName: string | null;
  createdAt: string;
};

type GuestGalleryProps = {
  slug: string;
  eventName: string;
  initialAssets: GuestGalleryAsset[];
  canDelete: boolean;
};

function mediaUrl(slug: string, mediaId: string) {
  return `/api/events/${encodeURIComponent(slug)}/media/${encodeURIComponent(mediaId)}`;
}

export function GuestGallery({
  slug,
  eventName,
  initialAssets,
  canDelete,
}: GuestGalleryProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const selectedIndex = assets.findIndex((asset) => asset.id === selectedId);
  const selectedAsset = selectedIndex >= 0 ? assets[selectedIndex] : null;

  useEffect(() => {
    if (!selectedAsset) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedAsset]);

  async function deleteSelectedAsset() {
    if (!selectedAsset || !canDelete || deleting) return;
    if (!window.confirm("Hapus foto ini dari galeri? Tindakan ini tidak dapat dibatalkan.")) return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch(mediaUrl(slug, selectedAsset.id), {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "Foto tidak dapat dihapus. Silakan coba lagi.");
      }
      setAssets((current) => current.filter((asset) => asset.id !== selectedAsset.id));
      setSelectedId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Foto tidak dapat dihapus. Silakan coba lagi.");
    } finally {
      setDeleting(false);
    }
  }

  if (assets.length === 0) return null;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 items-start gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {assets.map((asset, index) => {
          const label = asset.caption || asset.uploaderName || `Momen ${index + 1}`;
          const src = mediaUrl(slug, asset.id);
          return (
            <figure key={asset.id} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSelectedId(asset.id);
                }}
                aria-label={`Lihat ${asset.type === "VIDEO" ? "video" : "foto"}: ${label}`}
                className="group relative block w-full cursor-zoom-in bg-charcoal/5 text-left"
              >
                {asset.type === "VIDEO" ? (
                  <video
                    src={src}
                    preload="metadata"
                    aria-label={label}
                    className="aspect-[4/5] h-auto w-full object-cover"
                  />
                ) : (
                  <Image
                    src={src}
                    alt={label}
                    width={1200}
                    height={900}
                    unoptimized
                    className="aspect-[4/5] h-auto w-full object-cover"
                  />
                )}
                <span className="absolute bottom-2 right-2 rounded-full bg-charcoal/80 p-2 text-white opacity-100 transition group-hover:bg-charcoal sm:opacity-0 sm:group-hover:opacity-100">
                  <Eye aria-hidden="true" size={16} />
                </span>
              </button>
              {asset.caption || asset.uploaderName ? (
                <figcaption className="space-y-0.5 px-2 pt-1 pb-0.5 leading-snug sm:px-3">
                  {asset.caption ? (
                    <p className="truncate text-sm text-charcoal/80 sm:text-base">{asset.caption}</p>
                  ) : null}
                  {asset.uploaderName ? (
                    <p
                      className="truncate text-[10px] leading-[10px] text-charcoal/55 sm:text-[10px] sm:leading-3"
                      style={{ WebkitTextSizeAdjust: "none" }}
                    >
                      Diunggah oleh {asset.uploaderName}
                    </p>
                  ) : null}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>

      {selectedAsset ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-charcoal/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label={`Momen ${selectedIndex + 1} dari ${assets.length}`}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
            <p className="min-w-0 truncate text-sm">
              <span className="font-medium">{eventName}</span>
              <span className="ml-2 text-white/60">{selectedIndex + 1}/{assets.length}</span>
            </p>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Tutup foto"
              className="rounded-full border border-white/15 bg-white/5 p-3 transition hover:bg-white/15"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-4 sm:px-8">
            {selectedAsset.type === "VIDEO" ? (
              <video
                src={mediaUrl(slug, selectedAsset.id)}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full"
              />
            ) : (
              <Image
                src={mediaUrl(slug, selectedAsset.id)}
                alt={selectedAsset.caption || `Momen ${selectedIndex + 1} dari ${eventName}`}
                width={1600}
                height={1200}
                unoptimized
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
          <div className="border-t border-white/10 px-4 py-4">
            {selectedAsset.uploaderName ? (
              <p
                className="text-center text-[10px] leading-[10px] text-white/75 sm:text-[10px] sm:leading-3"
                style={{ WebkitTextSizeAdjust: "none" }}
              >
                Diunggah oleh {selectedAsset.uploaderName}
              </p>
            ) : null}
            {selectedAsset.caption ? (
              <p className="mt-1 text-center text-base leading-relaxed text-white">{selectedAsset.caption}</p>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-3 px-4 pb-5">
            <a
              href={`${mediaUrl(slug, selectedAsset.id)}?download=1`}
              download
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/15"
            >
              <Download aria-hidden="true" size={18} />
              Unduh
            </a>
            {canDelete ? (
              <button
                type="button"
                onClick={() => void deleteSelectedAsset()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-full border border-red-300/30 bg-red-900/70 px-4 py-3 text-sm transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
              >
                <Trash2 aria-hidden="true" size={18} />
                {deleting ? "Menghapus..." : "Hapus"}
              </button>
            ) : null}
          </div>
          {error ? <p role="alert" className="px-4 pb-4 text-center text-sm text-red-200">{error}</p> : null}
        </div>
      ) : null}
    </>
  );
}
