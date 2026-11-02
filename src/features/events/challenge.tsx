"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type EventChallengePrompt = {
  id: string;
  title: string;
};

export function EventChallengeSelector({
  prompts,
  value,
  onChange,
}: {
  prompts: EventChallengePrompt[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!prompts.length) return null;

  return (
    <div className="rounded-md border border-charcoal/10 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.16em] text-burgundy">Challenge prompt</p>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Clear</Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => {
              onChange(value === prompt.id ? null : prompt.id);
              setOpen(false);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              value === prompt.id ? "border-burgundy bg-burgundy text-cream" : "border-charcoal/15 bg-cream text-charcoal",
            )}
          >
            {prompt.title}
          </button>
        ))}
      </div>
      {open ? <div className="mt-2 text-xs text-charcoal/60">Optional prompt for this memory.</div> : null}
    </div>
  );
}
