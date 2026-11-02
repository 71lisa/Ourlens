"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { continueCheckoutAction, type CheckoutActionState } from "./actions";

const initialState: CheckoutActionState = {};

export function CheckoutButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(continueCheckoutAction, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Preparing secure checkout…" : "Continue to payment"}
      </Button>
    </form>
  );
}
