"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { getEstimatedPhotoCapacity, GUEST_PHOTO_LIMIT } from "@/lib/photo-quota";
import { calculateBuyerPromotion } from "@/server/promotions/pricing";
import {
  DEFAULT_PHOTO_EXPERIENCE,
  PHOTO_FILTERS,
  PHOTO_FRAMES,
  type PhotoFilterId,
  type PhotoFrameId,
} from "@/features/memories/media-studio-config";
import { createEventAction, type CreateEventState } from "./actions";
import { PhotoExperiencePicker } from "./photo-experience-picker";
import { EVENT_TYPES } from "./schema";

type CreateEventFormAction = (
  previousState: CreateEventState,
  formData: FormData,
) => Promise<CreateEventState>;

type PartnerPackagePrice = {
  price: string;
  basePrice: string;
  discountPercent: number;
  customPriceApplied: boolean;
};

type BuyerVoucherOption = {
  id: string;
  amount: string;
  expiresAt: string;
};

type BuyerPromotionOptions = {
  firstEventActive: boolean;
  firstEventEligible: boolean;
  reservedOrderId?: string;
  referralActive: boolean;
  vouchers: BuyerVoucherOption[];
};

type PackageOption = {
  id: string;
  name: string;
  guestCapacity: number | null;
  isUnlimited: boolean;
  price: string;
  currency: string;
  priceConfigured: boolean;
  storageLimitBytes: string;
  photoLimit: number | null;
  videoLimit: number | null;
  videoDurationLimit: number | null;
  eventDurationDays: number;
  retentionDays: number;
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

type FormValues = {
  eventType: string;
  name: string;
  organizerName: string;
  eventDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
  location: string;
  description: string;
  clientName: string;
  coverImageUrl: string;
  privacyMode: string;
  packageId: string;
  referralVoucherId: string;
  photoFilter: PhotoFilterId;
  photoFrame: PhotoFrameId;
};

const initialState: CreateEventState = {};
const initialFormValues: FormValues = {
  eventType: "WEDDING",
  name: "",
  organizerName: "",
  eventDate: "",
  startTime: "09:00",
  endDate: "",
  endTime: "12:00",
  timeZone: "Asia/Jakarta",
  location: "",
  description: "",
  clientName: "",
  coverImageUrl: "",
  privacyMode: "PUBLIC_LINK",
  packageId: "",
  referralVoucherId: "",
  photoFilter: DEFAULT_PHOTO_EXPERIENCE.filter,
  photoFrame: DEFAULT_PHOTO_EXPERIENCE.frame,
};

const stepLabels = ["Jenis acara", "Informasi acara", "Kapasitas", "Tampilan foto", "Ringkasan", "Masuk"];
const eventTypeMeta: Record<(typeof EVENT_TYPES)[number], { label: string; description: string }> = {
  WEDDING: { label: "Pernikahan", description: "Pernikahan dan momen istimewa." },
  BIRTHDAY: { label: "Ulang Tahun", description: "Ulang tahun yang penuh kebahagiaan." },
  GRADUATION: { label: "Wisuda", description: "Wisuda dan pencapaian bersejarah." },
  REUNION: { label: "Reuni", description: "Pertemuan kembali dengan orang tersayang." },
  CORPORATE: { label: "Acara Perusahaan", description: "Acara bisnis dan perayaan perusahaan." },
  PARTY: { label: "Pesta", description: "Pesta dan acara sosial." },
  OTHER: { label: "Acara Lainnya", description: "Acara spesial yang tidak termasuk kategori lain." },
};

const featureLabels: [keyof PackageOption, string][] = [
  ["customEventPage", "Halaman acara khusus"],
  ["customQRCode", "Kode QR khusus"],
  ["filtersEnabled", "Filter foto"],
  ["framesEnabled", "Bingkai foto"],
  ["aiEnhancementEnabled", "Peningkatan kecerdasan buatan"],
  ["aiCurationEnabled", "Kurasi kecerdasan buatan"],
  ["digitalAlbumEnabled", "Album digital"],
  ["liveMomentEnabled", "Momen langsung"],
  ["eventChallengesEnabled", "Tantangan acara"],
];

function formatPrice(value: string, currency: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getCapacityLabel(option: PackageOption | undefined) {
  if (!option) return "Pilih kapasitas";
  return option.isUnlimited ? "Tidak Terbatas" : `${option.guestCapacity ?? 0} tamu`;
}

export function CreateEventForm({
  packages,
  idempotencyKey,
  mode = "organizer",
  action = createEventAction,
  partnerPrices = {},
  buyerPromotions,
}: {
  packages: PackageOption[];
  idempotencyKey: string;
  mode?: "organizer" | "partner";
  action?: CreateEventFormAction;
  partnerPrices?: Record<string, PartnerPackagePrice>;
  buyerPromotions?: BuyerPromotionOptions;
}) {
  const isPartner = mode === "partner";
  const formActionName = isPartner ? "ourlens-partner-create-event-form" : "ourlens-create-event-form";
  const visibleStepLabels = isPartner ? stepLabels.slice(0, 5) : stepLabels;
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(formActionName);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<FormValues>;
        startTransition(() => setFormValues({ ...initialFormValues, ...parsed }));
      } catch {
        // ignore invalid session data
      }
    }
    startTransition(() => setHydrated(true));
  }, [formActionName]);

  useEffect(() => {
    if (hydrated) {
      sessionStorage.setItem(formActionName, JSON.stringify(formValues));
    }
  }, [formActionName, formValues, hydrated]);

  useEffect(() => {
    if (packages.length > 0 && !formValues.packageId) {
      startTransition(() => {
        setFormValues((previous) => ({ ...previous, packageId: packages[0].id }));
      });
    }
  }, [packages, formValues.packageId]);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === formValues.packageId) ?? packages[0] ?? null,
    [formValues.packageId, packages],
  );

  const eventType = formValues.eventType as keyof typeof eventTypeMeta;
  const selectedEventLabel = eventTypeMeta[eventType]?.label ?? "Pilih jenis acara";
  const eventDateLabel = formValues.eventDate
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${formValues.eventDate}T00:00:00.000Z`))
    : "";
  const selectedPhotoFilter = PHOTO_FILTERS.find((option) => option.id === formValues.photoFilter);
  const selectedPhotoFrame = PHOTO_FRAMES.find((option) => option.id === formValues.photoFrame);

  const stepsAreValid = [
    Boolean(formValues.eventType),
    Boolean(
      formValues.name &&
      (!isPartner || formValues.clientName.trim().length >= 2) &&
      formValues.eventDate &&
      formValues.startTime &&
      formValues.endDate &&
      formValues.endTime &&
      formValues.timeZone,
    ),
    Boolean(formValues.packageId),
    true,
    true,
    true,
  ];

  const currentStepIsValid = stepsAreValid[currentStep] ?? false;
  const selectedPartnerPrice = selectedPackage ? partnerPrices[selectedPackage.id] : undefined;
  const selectedVoucher = !isPartner && buyerPromotions?.referralActive
    ? buyerPromotions.vouchers.find((voucher) => voucher.id === formValues.referralVoucherId)
    : undefined;
  const selectedVoucherCanApply = Boolean(
    selectedVoucher && selectedPackage && Number(selectedVoucher.amount) < Number(selectedPackage.price),
  );
  const buyerQuote = !isPartner && selectedPackage?.priceConfigured && buyerPromotions &&
    (!selectedVoucher || selectedVoucherCanApply)
    ? calculateBuyerPromotion({
        baseAmount: Number(selectedPackage.price),
        firstEventEligible: buyerPromotions.firstEventEligible && !selectedVoucher,
        firstEventActive: buyerPromotions.firstEventActive,
        referralActive: buyerPromotions.referralActive,
        ...(selectedVoucher ? { voucherAmount: Number(selectedVoucher.amount) } : {}),
      })
    : null;

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setFormValues((previous) => ({ ...previous, [key]: value }));
  }

  function goToNextStep() {
    if (currentStepIsValid && currentStep < visibleStepLabels.length - 1) {
      setCurrentStep((previous) => previous + 1);
    }
  }

  function goToPreviousStep() {
    if (currentStep > 0) {
      setCurrentStep((previous) => previous - 1);
    }
  }

  function saveSessionAndRedirect() {
    sessionStorage.setItem(formActionName, JSON.stringify(formValues));
    router.push("/login?next=%2Fdashboard%2Fevents%2Fcreate");
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="eventType" value={formValues.eventType} />
      <input type="hidden" name="name" value={formValues.name} />
      {isPartner ? <input type="hidden" name="clientName" value={formValues.clientName} /> : null}
      <input type="hidden" name="organizerName" value={formValues.organizerName} />
      <input type="hidden" name="eventDate" value={formValues.eventDate} />
      <input type="hidden" name="startTime" value={formValues.startTime} />
      <input type="hidden" name="endDate" value={formValues.endDate} />
      <input type="hidden" name="endTime" value={formValues.endTime} />
      <input type="hidden" name="timeZone" value={formValues.timeZone} />
      <input type="hidden" name="location" value={formValues.location} />
      <input type="hidden" name="description" value={formValues.description} />
      <input type="hidden" name="coverImageUrl" value={formValues.coverImageUrl} />
      <input type="hidden" name="privacyMode" value={formValues.privacyMode} />
      <input type="hidden" name="packageId" value={formValues.packageId} />
      {!isPartner ? <input type="hidden" name="referralVoucherId" value={selectedVoucher?.id ?? ""} /> : null}
      <input type="hidden" name="photoFilter" value={formValues.photoFilter} />
      <input type="hidden" name="photoFrame" value={formValues.photoFrame} />

      <Card className="border-charcoal/10 bg-white/85">
        <div className="flex flex-col gap-5 border-b border-charcoal/10 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Buat acara</p>
              <h2 className="mt-2 font-display text-3xl">{stepLabels[currentStep]}</h2>
            </div>
            <div className="text-sm text-charcoal/55">{currentStep + 1} / {visibleStepLabels.length}</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {visibleStepLabels.map((item, index) => (
              <div
                key={item}
                className={cn(
                  "rounded-full border px-2 py-1 text-center text-[10px] font-medium uppercase tracking-[0.18em]",
                  index === currentStep
                    ? "border-burgundy bg-burgundy text-cream"
                    : index < currentStep
                      ? "border-charcoal/15 bg-charcoal/5 text-charcoal/70"
                      : "border-charcoal/15 bg-white text-charcoal/45",
                )}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {currentStep === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateField("eventType", type)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-all duration-200",
                    formValues.eventType === type
                      ? "border-burgundy bg-rose/10 shadow-[0_14px_30px_rgba(109,50,53,0.08)]"
                      : "border-charcoal/10 bg-white hover:border-burgundy/40",
                  )}
                >
                  <div className="font-display text-2xl text-charcoal">{eventTypeMeta[type].label}</div>
                  <p className="mt-2 text-sm text-charcoal/65">{eventTypeMeta[type].description}</p>
                </button>
              ))}
            </div>
          ) : null}

          {currentStep === 1 ? (
            <div className="grid gap-5 md:grid-cols-2">
              {isPartner ? (
                <Input
                  label="Nama klien"
                  name="clientName"
                  value={formValues.clientName}
                  onChange={(event) => updateField("clientName", event.target.value)}
                  placeholder="Nama klien acara"
                  maxLength={120}
                  required
                />
              ) : null}
              <Input
                label="Nama acara"
                name="name"
                value={formValues.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Pernikahan Anda & Pasangan"
                maxLength={120}
                required
              />
              <Input
                label="Nama penyelenggara"
                name="organizerName"
                value={formValues.organizerName}
                onChange={(event) => updateField("organizerName", event.target.value)}
                placeholder="Tim OurLens"
                maxLength={120}
              />
              <Input
                label="Tanggal acara"
                name="eventDate"
                type="date"
                value={formValues.eventDate}
                onChange={(event) => updateField("eventDate", event.target.value)}
                required
              />
              <Input
                label="Zona waktu"
                name="timeZone"
                value={formValues.timeZone}
                onChange={(event) => updateField("timeZone", event.target.value)}
                autoComplete="off"
                placeholder="Asia/Jakarta"
                required
              />
              <Input
                label="Waktu mulai"
                name="startTime"
                type="time"
                value={formValues.startTime}
                onChange={(event) => updateField("startTime", event.target.value)}
                required
              />
              <Input
                label="Waktu berakhir"
                name="endTime"
                type="time"
                value={formValues.endTime}
                onChange={(event) => updateField("endTime", event.target.value)}
                required
              />
              <Input
                label="Tanggal berakhir"
                name="endDate"
                type="date"
                value={formValues.endDate}
                onChange={(event) => updateField("endDate", event.target.value)}
                required
              />
              <Input
                label="Lokasi"
                name="location"
                value={formValues.location}
                onChange={(event) => updateField("location", event.target.value)}
                placeholder="Tempat atau kota"
                maxLength={160}
              />
              <div className="md:col-span-2">
                <Textarea
                  label="Informasi tambahan"
                  name="description"
                  value={formValues.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  placeholder="Tambahkan detail, instruksi, atau catatan acara…"
                  maxLength={500}
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  label="URL gambar sampul"
                  name="coverImageUrl"
                  type="url"
                  value={formValues.coverImageUrl}
                  onChange={(event) => updateField("coverImageUrl", event.target.value)}
                  placeholder="https://example.com/foto-anda.jpg"
                />
                {formValues.coverImageUrl ? (
                  <div
                    className="mt-3 aspect-[16/7] overflow-hidden rounded-2xl bg-cover bg-center"
                    style={{ backgroundImage: `url("${formValues.coverImageUrl.replaceAll('"', "%22")}")` }}
                    role="img"
                    aria-label={`Preview sampul untuk ${formValues.name || "acara"}`}
                  />
                ) : (
                  <div className="mt-3 flex aspect-[16/7] items-center justify-center rounded-2xl border border-dashed border-charcoal/20 bg-cream/50 text-sm text-charcoal/50">
                    Pratinjau foto sampul acara
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <Select
                  label="Siapa yang dapat melihat halaman acara?"
                  name="privacyMode"
                  value={formValues.privacyMode}
                  onChange={(event) => updateField("privacyMode", event.target.value)}
                >
                  <option value="PUBLIC_LINK">Siapa pun dengan tautan</option>
                  <option value="PRIVATE">Pribadi</option>
                </Select>
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {packages.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateField("packageId", item.id)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-all duration-200",
                      formValues.packageId === item.id
                        ? "border-burgundy bg-rose/10 shadow-[0_14px_30px_rgba(109,50,53,0.08)]"
                        : "border-charcoal/10 bg-white hover:border-burgundy/40",
                    )}
                  >
                    <div className="font-display text-2xl text-charcoal">{item.isUnlimited ? "Tidak Terbatas" : `${item.guestCapacity ?? 0} tamu`}</div>
                    <p className="mt-3 text-2xl font-semibold text-burgundy">
                      {formatPrice(partnerPrices[item.id]?.price ?? item.price, item.currency)}
                    </p>
                    {partnerPrices[item.id] ? (
                      <p className="mt-1 text-xs text-charcoal/55">
                        {partnerPrices[item.id].customPriceApplied
                          ? "Harga khusus mitra"
                          : partnerPrices[item.id].discountPercent > 0
                            ? `Diskon mitra ${partnerPrices[item.id].discountPercent}% · harga normal ${formatPrice(partnerPrices[item.id].basePrice, item.currency)}`
                            : "Harga normal mitra"}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-charcoal/65">
                      {item.isUnlimited ? "Tanpa batas jumlah tamu" : `Maksimal ${item.guestCapacity ?? 0} tamu dapat mengunggah`}
                    </p>
                    <p className="mt-1 text-xs text-charcoal/55">
                      Maks. {GUEST_PHOTO_LIMIT} foto per tamu ·{" "}
                      {getEstimatedPhotoCapacity(item) === null
                        ? "total mengikuti kapasitas penyimpanan"
                        : `estimasi ${getEstimatedPhotoCapacity(item)} foto`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <section className="space-y-4">
              <div>
                <p className="text-sm text-charcoal/65">
                  Pilih tampilan foto untuk acara ini. Pengaturan akan diterapkan otomatis ke foto tamu dan dapat diubah nanti melalui dasbor.
                </p>
              </div>
              <PhotoExperiencePicker
                filter={formValues.photoFilter}
                frame={formValues.photoFrame}
                eventName={formValues.name}
                eventDateLabel={eventDateLabel}
                onFilterChange={(photoFilter) => updateField("photoFilter", photoFilter)}
                onFrameChange={(photoFrame) => updateField("photoFrame", photoFrame)}
              />
            </section>
          ) : null}

          {currentStep === 4 ? (
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-charcoal/10 bg-cream/40 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Ringkasan acara</p>
                <div className="mt-4 space-y-3 text-sm text-charcoal/75">
                  <div className="flex items-center justify-between gap-3"><span>Jenis acara</span><span className="font-medium text-charcoal">{selectedEventLabel}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Nama acara</span><span className="font-medium text-charcoal">{formValues.name || "-"}</span></div>
                  {isPartner ? <div className="flex items-center justify-between gap-3"><span>Nama klien</span><span className="font-medium text-charcoal">{formValues.clientName || "-"}</span></div> : null}
                  <div className="flex items-center justify-between gap-3"><span>Penyelenggara</span><span className="font-medium text-charcoal">{formValues.organizerName || "-"}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Tanggal</span><span className="font-medium text-charcoal">{formValues.eventDate || "-"}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Kapasitas</span><span className="font-medium text-charcoal">{getCapacityLabel(selectedPackage)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Filter foto</span><span className="font-medium text-charcoal">{selectedPhotoFilter?.name ?? "-"}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Bingkai foto</span><span className="font-medium text-charcoal">{selectedPhotoFrame?.name ?? "-"}</span></div>
                </div>
                {!isPartner && buyerPromotions?.referralActive && buyerPromotions.vouchers.length > 0 ? (
                  <div className="mt-5 border-t border-charcoal/10 pt-4">
                    <Select
                      label="Voucher referral (opsional)"
                      name="referralVoucherChoice"
                      value={selectedVoucher?.id ?? ""}
                      onChange={(event) => updateField("referralVoucherId", event.target.value)}
                    >
                      <option value="">Gunakan promo otomatis jika tersedia</option>
                      {buyerPromotions.vouchers.map((voucher) => (
                        <option key={voucher.id} value={voucher.id}>
                          Voucher {formatPrice(voucher.amount, "IDR")} · berlaku hingga {new Date(voucher.expiresAt).toLocaleDateString("id-ID")}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-2 text-xs text-charcoal/55">Satu transaksi hanya dapat menggunakan satu promo.</p>
                    {selectedVoucher && !selectedVoucherCanApply ? (
                      <p className="mt-2 text-xs text-burgundy" role="alert">
                        Harga paket harus lebih besar dari nilai voucher agar pembayaran tetap diperlukan.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-charcoal/10 bg-charcoal px-5 py-4 text-cream">
                <p className="text-xs uppercase tracking-[0.2em] text-cream/70">Total</p>
                {!isPartner && buyerPromotions?.firstEventActive && buyerPromotions.firstEventEligible ? (
                  <p className="mt-2 text-sm text-cream/80">
                    Diskon 15% untuk pembelian acara pertama diterapkan otomatis, kecuali Anda memilih voucher referral.
                  </p>
                ) : null}
                {!isPartner && buyerPromotions?.reservedOrderId ? (
                  <Link
                    href={`/dashboard/transactions/${buyerPromotions.reservedOrderId}`}
                    className="mt-3 inline-block text-sm font-medium text-cream underline underline-offset-4"
                  >
                    Lanjutkan pembayaran acara pertama yang masih tertunda
                  </Link>
                ) : null}
                {buyerQuote && selectedPackage ? (
                  <div className="mt-4 space-y-1.5">
                    {buyerQuote.discountAmount > 0 ? (
                      <>
                        <p className="text-sm text-cream/60 line-through">
                          {formatPrice(String(buyerQuote.baseAmount), selectedPackage.currency)}
                        </p>
                        <p className="text-xs font-medium text-emerald-200">
                          Potongan {formatPrice(String(buyerQuote.discountAmount), selectedPackage.currency)}
                          {buyerQuote.promotionType === "FIRST_EVENT" ? " · Diskon acara pertama 15%" : " · Voucher referral"}
                        </p>
                      </>
                    ) : null}
                    <p className="font-display text-4xl">
                      {formatPrice(String(buyerQuote.finalAmount), selectedPackage.currency)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 font-display text-4xl">
                    {selectedPackage
                      ? formatPrice(selectedPartnerPrice?.price ?? selectedPackage.price, selectedPackage.currency)
                      : "-"}
                  </p>
                )}
                {selectedPackage && selectedPartnerPrice ? (
                  <p className="mt-1 text-xs text-cream/70">
                    {selectedPartnerPrice.customPriceApplied
                      ? "Harga khusus mitra"
                      : selectedPartnerPrice.discountPercent > 0
                        ? `Diskon mitra ${selectedPartnerPrice.discountPercent}%`
                        : "Harga normal mitra"}
                  </p>
                ) : null}
                <ul className="mt-4 space-y-2 text-sm text-cream/75">
                  {featureLabels
                    .filter(([key]) => selectedPackage && (selectedPackage[key] === true))
                    .map(([, label]) => <li key={label}>• {label}</li>)}
                </ul>
              </div>
            </div>
          ) : null}

          {currentStep === 5 ? (
            <div className="rounded-2xl border border-charcoal/10 bg-cream/40 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Masuk untuk melanjutkan</p>
              <h3 className="mt-2 font-display text-3xl">Selesaikan proses pembayaran Anda.</h3>
              <p className="mt-3 text-sm text-charcoal/70">
                Informasi acara yang sudah Anda isi akan tetap tersimpan di browser saat Anda masuk atau mendaftar.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button type="button" size="lg" onClick={saveSessionAndRedirect}>Masuk / Daftar</Button>
                <Button type="button" variant="outline" size="lg" onClick={goToPreviousStep}>Kembali</Button>
              </div>
            </div>
          ) : null}
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-sm text-burgundy">{state.error}</p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse justify-between gap-3 border-t border-charcoal/10 pt-5 sm:flex-row">
          <div className="flex gap-3">
            {currentStep > 0 && currentStep < visibleStepLabels.length - 1 ? (
              <Button type="button" variant="outline" onClick={goToPreviousStep}>Kembali</Button>
            ) : null}
            {currentStep === visibleStepLabels.length - 1 ? null : (
              <Button
                type="button"
                onClick={goToNextStep}
                className={buttonVariants({ size: "lg" })}
                disabled={!currentStepIsValid}
              >
                Lanjutkan
              </Button>
            )}
          </div>

          {currentStep === 4 ? (
            <Button
              type="submit"
              size="lg"
              disabled={pending || !selectedPackage || Boolean(selectedVoucher && !selectedVoucherCanApply)}
            >
              {pending ? "Membuat acara…" : "Lanjut ke pembayaran"}
            </Button>
          ) : null}
        </div>
      </Card>
    </form>
  );
}
