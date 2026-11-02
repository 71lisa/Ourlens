import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
};

export function Select({ label, error, id, className, children, ...props }: SelectProps) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm font-medium text-charcoal">{label}</span>
      <select
        id={inputId}
        className={cn(
          "min-h-11 w-full rounded-md border border-charcoal/15 bg-white px-3 text-base text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy",
          error && "border-burgundy",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="text-sm text-burgundy">{error}</span> : null}
    </label>
  );
}
