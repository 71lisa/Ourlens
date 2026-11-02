import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-burgundy/20 bg-rose/30 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-burgundy",
        className,
      )}
      {...props}
    />
  );
}
