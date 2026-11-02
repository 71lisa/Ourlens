import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, id, className, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1.5" htmlFor={inputId}>
      <span className="text-sm font-medium text-charcoal">{label}</span>
      <input
        id={inputId}
        className={cn(
          "min-h-11 w-full rounded-md border border-charcoal/15 bg-white px-3 text-base text-charcoal placeholder:text-charcoal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy",
          error && "border-burgundy",
          className,
        )}
        {...props}
      />
      {error ? <span className="text-sm text-burgundy">{error}</span> : null}
    </label>
  );
}
