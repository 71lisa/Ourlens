"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReferralShare({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copyLink() {
    setCopied(false);
    setError("");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Tautan tidak dapat disalin otomatis. Silakan salin dari kolom tautan.");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-charcoal">Kode referral</p>
        <p className="mt-1 font-mono text-lg font-semibold tracking-wide text-burgundy">{code}</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-charcoal">Tautan pendaftaran</span>
        <input
          readOnly
          value={link}
          className="min-h-11 w-full rounded-md border border-charcoal/15 bg-white px-3 text-sm text-charcoal"
        />
      </label>
      <Button type="button" variant="outline" onClick={copyLink}>Salin tautan referral</Button>
      {copied ? <p className="text-sm text-emerald-700" role="status">Tautan berhasil disalin.</p> : null}
      {error ? <p className="text-sm text-burgundy" role="alert">{error}</p> : null}
    </div>
  );
}