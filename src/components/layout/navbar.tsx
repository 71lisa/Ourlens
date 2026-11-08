import Link from "next/link";
import { auth } from "@/auth";
import { navLinks } from "@/config/site";
import { BrandLogo } from "./brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LogoutButton } from "./logout-button";
import { prisma } from "@/server/db/prisma";

export async function Navbar() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const activePartner = session?.user && !isAdmin
    ? await prisma.partnerAccount.findFirst({
        where: { userId: session.user.id, status: "ACTIVE" },
        select: { id: true },
      })
    : null;
  const dashboardHref = activePartner || session?.user.role === "PARTNER"
    ? "/partner"
    : isAdmin
      ? "/admin"
      : "/dashboard";

  return (
    <header className="border-b border-charcoal/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo />
        <nav aria-label="Navigasi utama" className="hidden items-center gap-6 md:flex">
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
              <Link href={dashboardHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {isAdmin ? "Administrator" : "Dasbor"}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Masuk
              </Link>
              <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
                Buat Acara
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
