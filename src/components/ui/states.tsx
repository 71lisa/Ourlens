import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse bg-charcoal/10", className)}
      aria-hidden
      {...props}
    />
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-charcoal/70" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-burgundy/20 border-t-burgundy" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-charcoal/15 px-6 py-12 text-center">
      <h2 className="font-display text-2xl text-charcoal">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-charcoal/70">{description}</p>
    </div>
  );
}
