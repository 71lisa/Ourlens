"use client";

import { useActionState } from "react";
import { loginAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: AuthActionState = {};

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <Input
        label="Kata sandi"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error ? (
        <p className="text-sm text-burgundy" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Memproses masuk…" : "Masuk"}
      </Button>
    </form>
  );
}
