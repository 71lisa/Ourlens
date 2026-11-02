"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyEventLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={copyLink}>
      {copied ? "Copied" : "Copy event link"}
    </Button>
  );
}