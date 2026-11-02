"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createEventAction, type CreateEventState } from "./actions";
import { EVENT_TYPES } from "./schema";

type PackageOption = {
  id: string;
  name: string;
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

const initialState: CreateEventState = {};
const featureLabels: [keyof PackageOption, string][] = [
  ["customEventPage", "Custom event page"],
  ["customQRCode", "Custom QR code"],
  ["filtersEnabled", "Photo filters"],
  ["framesEnabled", "Photo frames"],
  ["aiEnhancementEnabled", "AI enhancement"],
  ["aiCurationEnabled", "AI curation"],
  ["digitalAlbumEnabled", "Digital album"],
  ["liveMomentEnabled", "Live Moment"],
  ["eventChallengesEnabled", "Event challenges"],
];
const eventLabels: Record<(typeof EVENT_TYPES)[number], string> = {
  WEDDING: "Wedding",
  BIRTHDAY: "Birthday",
  GRADUATION: "Graduation",
  REUNION: "Reunion",
  CORPORATE: "Corporate",
  PARTY: "Party",
  OTHER: "Other",
};

function packageStorage(bytes: string) {
  return `${(Number(bytes) / 1024 ** 3).toFixed(0)} GB storage`;
}

function packagePrice(item: PackageOption) {
  if (!item.priceConfigured) return "Price not configured";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: item.currency,
    maximumFractionDigits: 0,
  }).format(Number(item.price));
}

export function CreateEventForm({ packages, idempotencyKey }: { packages: PackageOption[]; idempotencyKey: string }) {
  const [state, formAction, pending] = useActionState(createEventAction, initialState);

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Card className="space-y-5 border-charcoal/10 bg-white/80">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-burgundy">01 / The occasion</p>
          <h2 className="mt-2 font-display text-2xl">Event information</h2>
        </div>
        <Input label="Event name" name="name" placeholder="Audrey & John’s wedding" maxLength={120} required />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Event type" name="eventType" defaultValue="" required>
            <option value="" disabled>Choose an event type</option>
            {EVENT_TYPES.map((type) => <option key={type} value={type}>{eventLabels[type]}</option>)}
          </Select>
          <Input label="Event time zone" name="timeZone" defaultValue="Asia/Jakarta" autoComplete="off" required />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Start date" name="eventDate" type="date" required />
          <Input label="Start time" name="startTime" type="time" required />
          <Input label="End date" name="endDate" type="date" required />
          <Input label="End time" name="endTime" type="time" required />
        </div>
        <p className="-mt-3 text-xs text-charcoal/55">Use an IANA time zone such as Asia/Jakarta. Guest contributions open at the start and close at the end in this time zone.</p>
        <Input label="Location" name="location" placeholder="Venue or city" maxLength={160} />
        <Textarea label="A note for your guests" name="description" placeholder="Share a little about the celebration…" maxLength={500} />
        <Input label="Cover image URL" name="coverImageUrl" type="url" placeholder="https://example.com/your-photo.jpg" />
        <p className="-mt-3 text-xs text-charcoal/55">Image upload will be available when event storage is connected.</p>
        <Select label="Who can view the event page?" name="privacyMode" defaultValue="PUBLIC_LINK" required>
          <option value="PUBLIC_LINK">Anyone with the event link</option>
          <option value="PRIVATE">Private</option>
        </Select>
      </Card>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-burgundy">02 / The collection</p>
          <h2 className="mt-2 font-display text-2xl">Choose your package</h2>
        </div>
        {packages.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {packages.map((item, index) => (
              <label key={item.id} className="block cursor-pointer">
                <input className="peer sr-only" type="radio" name="packageId" value={item.id} required defaultChecked={index === 0} />
                <span className="block h-full border border-charcoal/15 bg-white p-5 transition peer-checked:border-burgundy peer-checked:bg-rose/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-burgundy">
                  <span className="block font-display text-xl">{item.name}</span>
                  <span className="mt-2 block font-medium text-burgundy">{packagePrice(item)}</span>
                  <span className="mt-3 block text-sm text-charcoal/75">{packageStorage(item.storageLimitBytes)}</span>
                  <span className="mt-1 block text-xs text-charcoal/60">{item.photoLimit ?? "Flexible"} photos · {item.videoLimit ?? "Flexible"} videos</span>
                  <span className="mt-1 block text-xs text-charcoal/60">{item.videoDurationLimit ?? "Video uploads disabled"}{item.videoDurationLimit ? " sec max per video" : ""}</span>
                  <span className="mt-1 block text-xs text-charcoal/60">Event duration: {item.eventDurationDays} days · Retention: {item.retentionDays} days</span>
                  <span className="mt-3 block space-y-1 text-xs text-charcoal/60">
                    {featureLabels.filter(([key]) => item[key] === true).length ? (
                      featureLabels.filter(([key]) => item[key] === true).map(([, label]) => <span className="block" key={label}>{label}</span>)
                    ) : "No optional features enabled in current configuration"}
                  </span>
                  <span className="mt-4 block text-xs font-medium uppercase tracking-wider text-burgundy">Select package</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="border border-charcoal/15 bg-white p-5 text-sm text-charcoal/70">No active packages are available. Ask an administrator to enable a package.</p>
        )}
      </section>

      {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-charcoal/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-charcoal/60">Your event remains unavailable to guests until payment is verified.</p>
        <Button type="submit" size="lg" disabled={pending || packages.length === 0}>
          {pending ? "Creating your order…" : "Continue to payment"}
        </Button>
      </div>
    </form>
  );
}