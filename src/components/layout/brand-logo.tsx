import Link from "next/link";
import { cn } from "@/lib/cn";

type BrandLogoProps = {
  variant?: "primary" | "light" | "dark";
  className?: string;
};

export function BrandLogo({ variant = "primary", className }: BrandLogoProps) {
  const word = variant === "light" ? "#F7F1EA" : "#2E2E2E";
  const ring = variant === "light" ? "#D4A37C" : "#8B0000";

  return (
    <Link href="/" className={cn("inline-flex items-center gap-2", className)} aria-label="OurLens home">
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" stroke={ring} strokeWidth="2.2" />
        <circle cx="18" cy="18" r="7" fill="none" stroke={ring} strokeWidth="1.6" />
        <circle cx="18" cy="18" r="2.2" fill={ring} />
        <rect x="25" y="8" width="6" height="3.5" rx="0.6" fill={ring} />
      </svg>
      <span className="font-display text-2xl tracking-tight" style={{ color: word }}>
        OurLens
      </span>
    </Link>
  );
}
