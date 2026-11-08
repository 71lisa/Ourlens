"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFreeTrialAction, type FreeTrialActionState } from "./actions";

const initialState: FreeTrialActionState = {};

export function FreeTrialForm() {
  const [state, formAction, pending] = useActionState(createFreeTrialAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="Nama acara demo"
        name="name"
        placeholder="Contoh: Demo Pernikahan Maya & Rafi"
        minLength={2}
        maxLength={120}
        required
      />
      {state.error ? <p className="text-sm text-burgundy" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyiapkan acara…" : "Mulai uji coba gratis"}
      </Button>
    </form>
  );
}