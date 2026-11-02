import Link from "next/link";
import { auth } from "@/auth";
import { navLinks } from "@/config/site";
import { BrandLogo } from "./brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LogoutButton } from "./logout-button";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="border-b border-charcoal/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo />
        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-charcoal/80 hover:text-burgundy"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {session?.user ? (
            <>
              <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Dashboard
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Log in
              </Link>
              <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
                Create Your Event
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
