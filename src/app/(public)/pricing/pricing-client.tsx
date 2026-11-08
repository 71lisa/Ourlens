"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Container } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getEstimatedPhotoCapacity, GUEST_PHOTO_LIMIT } from "@/lib/photo-quota";

type PricingPackage = {
  id: string;
  name: string;
  guestCapacity: number | null;
  isUnlimited: boolean;
  price: string;
  currency: string;
  customEventPage: boolean;
  customQRCode: boolean;
  filtersEnabled: boolean;
  framesEnabled: boolean;
  aiEnhancementEnabled: boolean;
  aiCurationEnabled: boolean;
  digitalAlbumEnabled: boolean;
  liveMomentEnabled: boolean;
  eventChallengesEnabled: boolean;
};

const faqs = [
  {
    question: "Apakah kapasitas bisa berubah setelah acara dibuat?",
    answer: "Ya. Kapasitas dapat diubah kembali dari dasbor penyelenggara sesuai kebutuhan acara Anda.",
  },
  {
    question: "Apakah harga dihitung per acara atau per tamu?",
    answer: "OurLens memakai model pembayaran satu kali per acara. Harga ditentukan berdasarkan kapasitas tamu yang Anda pilih.",
  },
  {
    question: "Apakah ada biaya tambahan?",
    answer: "Tidak. Harga yang tampil adalah total pembayaran acara untuk kapasitas pilihan Anda.",
  },
  {
    question: "Bagaimana jika saya butuh lebih dari 200 tamu?",
    answer: "Pilih opsi Tidak Terbatas. Harga sudah ditetapkan dan selalu lebih tinggi dari kapasitas 200 tamu.",
  },
];

function formatPrice(value: string, currency: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const featureItems = [
  "Halaman acara khusus",
  "Galeri foto dan video",
  "Kode QR acara",
  "Filter dan bingkai foto",
  "Peningkatan foto berbasis kecerdasan buatan",
  "Album digital",
  "Momen langsung",
  "Tantangan acara",
];

export function PricingClient({ packages }: { packages: PricingPackage[] }) {
  const [selectedId, setSelectedId] = useState(packages[0]?.id ?? "");

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedId) ?? packages[0] ?? null,
    [packages, selectedId],
  );

  const selectedLabel = selectedPackage?.isUnlimited
    ? "Tidak Terbatas"
    : `${selectedPackage?.guestCapacity ?? 0} tamu`;
  const selectedPhotoCapacity = selectedPackage
    ? getEstimatedPhotoCapacity(selectedPackage)
    : null;

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-burgundy">Harga OurLens</p>
          <h1 className="mt-4 font-display text-4xl text-charcoal md:text-6xl">Harga acara yang jelas, tanpa hambatan.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-charcoal/70 md:text-lg">
            Pilih kapasitas tamu yang sesuai dengan acara Anda, lalu lihat total pembayaran secara real-time.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packages.map((item) => {
            const active = item.id === selectedPackage?.id;
            const estimatedPhotoCapacity = getEstimatedPhotoCapacity(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "rounded-2xl border p-5 text-left transition-all duration-200",
                  active
                    ? "border-burgundy bg-rose/10 shadow-[0_18px_45px_rgba(109,50,53,0.1)]"
                    : "border-charcoal/10 bg-white hover:border-burgundy/40 hover:bg-white",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-2xl text-charcoal">
                    {item.isUnlimited ? "Tidak Terbatas" : `${item.guestCapacity ?? 0} tamu`}
                  </span>
                  {active ? (
                    <span className="rounded-full bg-burgundy px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cream">
                      Dipilih
                    </span>
                  ) : null}
                </div>
                <p className="mt-5 text-2xl font-semibold text-burgundy">{formatPrice(item.price, item.currency)}</p>
                <p className="mt-2 text-sm text-charcoal/60">
                    {item.isUnlimited ? "Tanpa batas jumlah tamu" : `Maksimal ${item.guestCapacity ?? 0} tamu dapat mengunggah`}
                </p>
                  <p className="mt-2 text-xs text-charcoal/55">
                    Maksimal {GUEST_PHOTO_LIMIT} foto per tamu ·{" "}
                    {estimatedPhotoCapacity === null
                      ? "total foto mengikuti jumlah tamu dan kapasitas penyimpanan"
                      : `estimasi hingga ${estimatedPhotoCapacity} foto`}
                  </p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-3xl border border-charcoal/10 bg-white p-6 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Kapasitas</p>
                <h2 className="mt-2 font-display text-3xl text-charcoal">{selectedLabel}</h2>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-charcoal/50">Total</p>
                <p className="mt-2 text-3xl font-semibold text-burgundy">{selectedPackage ? formatPrice(selectedPackage.price, selectedPackage.currency) : "-"}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-cream/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-charcoal/60">Fitur yang termasuk</p>
                <ul className="mt-4 space-y-3 text-sm text-charcoal/70">
                  {featureItems.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-cream/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-charcoal/60">Catatan penting</p>
                <ul className="mt-4 space-y-3 text-sm text-charcoal/70">
                  <li>• Pembayaran satu kali per acara</li>
                  <li>• Semua harga memakai mata uang IDR</li>
                  <li>• Kapasitas paket adalah jumlah maksimal tamu unik yang dapat mengunggah foto</li>
                  <li>• Setiap tamu mendapat kuota maksimal 20 foto</li>
                  <li>• Paket terbatas: estimasi total foto = kapasitas tamu × 20</li>
                  <li>• Paket Tidak Terbatas tidak membatasi jumlah tamu; penggunaan tetap mengikuti kuota penyimpanan</li>
                  <li>• Untuk kapasitas lebih dari 200 tamu, pilih opsi Tidak Terbatas</li>
                  <li>• Admin dapat menyesuaikan harga melalui dasbor</li>
                </ul>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-charcoal/10 bg-charcoal p-6 text-cream md:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-cream/70">Ringkasan</p>
            <h2 className="mt-3 font-display text-3xl">{selectedLabel}</h2>
            <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-sm text-cream/80">
                <span>Kapasitas</span>
                <span>{selectedLabel}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm text-cream/80">
                <span>Kuota foto</span>
                <span className="text-right">
                  Maks. {GUEST_PHOTO_LIMIT} per tamu
                  <br />
                  {!selectedPackage
                    ? "Pilih paket"
                    : selectedPhotoCapacity === null
                      ? "Total mengikuti kapasitas penyimpanan"
                      : `Estimasi ${selectedPhotoCapacity} foto`}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-cream/80">
                <span>Harga</span>
                <span>{selectedPackage ? formatPrice(selectedPackage.price, selectedPackage.currency) : "-"}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-cream/80">
                <span>Fasilitas</span>
                <span>Termasuk</span>
              </div>
            </div>
            <div className="mt-8 rounded-2xl bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cream/60">Total pembayaran</p>
              <p className="mt-2 text-3xl font-semibold text-cream">{selectedPackage ? formatPrice(selectedPackage.price, selectedPackage.currency) : "-"}</p>
            </div>
            <Link href="/dashboard/events/create" className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full justify-center")}>
              Buat Acara Sekarang
            </Link>
          </aside>
        </div>

        <section className="rounded-3xl border border-charcoal/10 bg-white p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Tanya jawab</p>
          <h2 className="mt-2 font-display text-3xl text-charcoal">Pertanyaan yang sering muncul</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {faqs.map((item) => (
              <div key={item.question} className="rounded-2xl border border-charcoal/10 bg-cream/40 p-4">
                <p className="font-semibold text-charcoal">{item.question}</p>
                <p className="mt-2 text-sm text-charcoal/70">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Container>
  );
}
