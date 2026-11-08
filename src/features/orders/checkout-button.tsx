"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { continueCheckoutAction, type CheckoutActionState } from "./actions";

const initialState: CheckoutActionState = {};

export function CheckoutButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(continueCheckoutAction, initialState);

  useEffect(() => {
    if (state.checkoutUrl) window.location.assign(state.checkoutUrl);
  }, [state.checkoutUrl]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      {state.error ? <p role="alert" className="text-sm text-burgundy">{state.error}</p> : null}
      {state.checkoutUrl ? (
        <p role="status" className="text-sm text-charcoal/65">Mengalihkan ke halaman pembayaran…</p>
      ) : null}
      <Button type="submit" disabled={pending || Boolean(state.checkoutUrl)}>
        {pending || state.checkoutUrl ? "Menyiapkan pembayaran aman…" : "Lanjut ke pembayaran"}
      </Button>
    </form>
  );
}
