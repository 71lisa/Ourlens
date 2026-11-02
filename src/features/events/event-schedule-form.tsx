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
        <Input label="Start date" name="eventDate" type="date" defaultValue={initialValue.eventDate} required />
        <Input label="Start time" name="startTime" type="time" defaultValue={initialValue.startTime} required />
        <Input label="End date" name="endDate" type="date" defaultValue={initialValue.endDate} required />
        <Input label="End time" name="endTime" type="time" defaultValue={initialValue.endTime} required />
        <Input label="Event time zone" name="timeZone" defaultValue={initialValue.timeZone} autoComplete="off" required />
      </div>
      {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-green-900">{state.success}</p> : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving schedule…" : "Save schedule"}
      </Button>
    </form>
  );
}
