import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="space-y-3">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.28em] text-burgundy">{eyebrow}</p>
      ) : null}
      <h1 className="font-display text-4xl leading-tight text-charcoal sm:text-5xl">{title}</h1>
      {description ? (
        <p className="max-w-2xl text-base text-charcoal/75 sm:text-lg">{description}</p>
      ) : null}
    </header>
  );
}
