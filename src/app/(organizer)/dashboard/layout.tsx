import Link from "next/link";
import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LogoutButton } from "@/components/layout/logout-button";
import { redirect } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dasbor" },
  { href: "/dashboard/events", label: "Acara" },
  { href: "/dashboard/events/create", label: "Buat acara" },
  { href: "/dashboard/transactions", label: "Transaksi" },
  { href: "/dashboard/referrals", label: "Referral & voucher" },
  { href: "/dashboard/trial", label: "Uji coba gratis" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin");
  if (session.user.role === "PARTNER") redirect("/partner");
  if (session.user.role !== "ORGANIZER") redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b border-charcoal/10 bg-cream-deep/50 md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <BrandLogo />
          <div className="md:hidden">
            <LogoutButton />
          </div>
        </div>
        <nav aria-label="Navigasi penyelenggara" className="flex gap-2 overflow-x-auto px-3 pb-3 md:flex-col md:pb-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="min-h-11 whitespace-nowrap px-3 py-2 text-sm text-charcoal/80 hover:text-burgundy"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden px-3 md:block">
          <p className="truncate px-3 text-xs text-charcoal/50">
            Penyelenggara · {session.user.email}
          </p>
          <LogoutButton />
        </div>
      </aside>
      <div className="flex-1 px-4 py-8 sm:px-8">{children}</div>
    </div>
  );
}
