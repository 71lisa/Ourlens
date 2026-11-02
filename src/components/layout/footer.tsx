import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { navLinks, siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-charcoal/10 bg-cream">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-sm space-y-3">
          <BrandLogo />
          <p className="text-sm text-charcoal/70">{siteConfig.tagline}</p>
          <p className="text-sm text-charcoal/60">
            Professional photographers capture the official story. OurLens captures everyone&apos;s
            story.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-charcoal/75 hover:text-burgundy">
              {link.label}
            </Link>
          ))}
          <Link href="/login" className="text-charcoal/75 hover:text-burgundy">
            Organizer login
          </Link>
        </nav>
      </div>
      <div className="border-t border-charcoal/10 py-4 text-center text-xs text-charcoal/50">
        © {new Date().getFullYear()} OurLens. Collective memory for live events.
      </div>
    </footer>
  );
}
