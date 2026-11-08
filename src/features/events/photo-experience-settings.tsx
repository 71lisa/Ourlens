"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PHOTO_EXPERIENCE,
  type PhotoFilterId,
  type PhotoFrameId,
} from "@/features/memories/media-studio-config";
import {
  savePhotoExperienceAction,
  type PhotoExperienceActionState,
} from "./photo-experience-actions";
import { PhotoExperiencePicker } from "./photo-experience-picker";

const initialState: PhotoExperienceActionState = {};

export function PhotoExperienceSettings({
  eventId,
  eventName,
  eventDateLabel,
  initialFilter,
  initialFrame,
}: {
  eventId: string;
  eventName: string;
  eventDateLabel: string;
  initialFilter?: PhotoFilterId;
  initialFrame?: PhotoFrameId;
}) {
  const [state, formAction, pending] = useActionState(savePhotoExperienceAction, initialState);
  const [filter, setFilter] = useState<PhotoFilterId>(initialFilter ?? DEFAULT_PHOTO_EXPERIENCE.filter);
  const [frame, setFrame] = useState<PhotoFrameId>(initialFrame ?? DEFAULT_PHOTO_EXPERIENCE.frame);

  return (
    <section className="space-y-5 border-y border-charcoal/10 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Tampilan Foto</p>
        <h2 className="mt-2 font-display text-2xl">Atur tampilan semua foto tamu.</h2>
        <p className="mt-2 text-sm text-charcoal/65">
          Tamu dapat melihat pratinjau, tetapi tidak dapat mengubah pengaturan acara ini.
        </p>
      </div>

      <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="lg:col-span-2">
          <PhotoExperiencePicker
            filter={filter}
            frame={frame}
            eventName={eventName}
            eventDateLabel={eventDateLabel}
            onFilterChange={setFilter}
            onFrameChange={setFrame}
            filterFieldName="filter"
            frameFieldName="frame"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan Tampilan Foto"}
            </Button>
            {state.success ? <p role="status" className="text-sm text-green-900">{state.success}</p> : null}
            {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
          </div>
        </div>
      </form>
    </section>
  );
}
