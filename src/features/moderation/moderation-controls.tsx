"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  moderateMemoryAction,
  type ModerationActionState,
} from "./actions";

const initialState: ModerationActionState = {};

export function ModerationControls({
  eventId,
  mediaAssetId,
}: {
  eventId: string;
  mediaAssetId: string;
}) {
  const [state, formAction, pending] = useActionState(moderateMemoryAction, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="mediaAssetId" value={mediaAssetId} />
        <Button name="decision" value="APPROVED" disabled={pending}>
          {pending ? "Saving…" : "Approve"}
        </Button>
        <Button name="decision" value="REJECTED" variant="outline" disabled={pending}>
          Reject
        </Button>
      </form>
      {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-charcoal/65">{state.success}</p> : null}
    </div>
  );
}