import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/cn";

type BrandLogoProps = {
  href?: string;
  className?: string;
};

export function BrandLogo({ href = "/", className }: BrandLogoProps) {
  return (
    <Link href={href} className={cn("inline-flex shrink-0 items-center", className)} aria-label="OurLens">
      <Image
        src="/brand/logo.png"
        alt="OurLens"
        width={364}
        height={137}
        className="h-11 w-auto object-contain"
      />
    </Link>
  );
}
