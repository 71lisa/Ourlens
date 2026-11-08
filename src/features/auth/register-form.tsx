"use client";

import { useActionState } from "react";
import { registerAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: AuthActionState = {};

export function RegisterForm({ referralCode = "" }: { referralCode?: string }) {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      {referralCode ? <input type="hidden" name="referralCode" value={referralCode} /> : null}
      {referralCode ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Anda mendaftar melalui tautan referral. Teman Anda akan menerima voucher setelah pembayaran pertama Anda berhasil diverifikasi.
        </p>
      ) : null}
      <Input label="Nama" name="name" autoComplete="name" required />
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <Input
        label="Kata sandi"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Input
        label="Konfirmasi kata sandi"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state.error ? (
        <p className="text-sm text-burgundy" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Membuat akun…" : "Buat akun penyelenggara"}
      </Button>
    </form>
  );
}
