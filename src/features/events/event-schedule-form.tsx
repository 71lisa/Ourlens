"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateEventScheduleAction, type CreateEventState } from "./actions";
import type { EventScheduleInput } from "./schema";

const initialState: CreateEventState = {};

export function EventScheduleForm({
  eventId,
  initialValue,
}: {
  eventId: string;
  initialValue: EventScheduleInput;
}) {
  const [state, formAction, pending] = useActionState(updateEventScheduleAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Tanggal mulai" name="eventDate" type="date" defaultValue={initialValue.eventDate} required />
        <Input label="Waktu mulai" name="startTime" type="time" defaultValue={initialValue.startTime} required />
        <Input label="Tanggal berakhir" name="endDate" type="date" defaultValue={initialValue.endDate} required />
        <Input label="Waktu berakhir" name="endTime" type="time" defaultValue={initialValue.endTime} required />
        <Input label="Zona waktu acara" name="timeZone" defaultValue={initialValue.timeZone} autoComplete="off" required />
      </div>
      {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-green-900">{state.success}</p> : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Menyimpan jadwal…" : "Simpan jadwal"}
      </Button>
    </form>
  );
}
