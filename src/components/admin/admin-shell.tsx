"use client";

import {
  BadgePercent,
  CalendarDays,
  ChartColumnIncreasing,
  CreditCard,
  FileCheck2,
  Gift,
  LayoutDashboard,
  Package,
  Images,
  ShoppingCart,
  Store,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LogoutButton } from "@/components/layout/logout-button";
import { cn } from "@/lib/cn";

const navGroups: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: LucideIcon }>;
}> = [
  {
    label: "Pusat kendali",
    items: [{ href: "/admin", label: "Ringkasan", icon: LayoutDashboard }],
  },
  {
    label: "Kemitraan",
    items: [
      { href: "/admin/partner-applications", label: "Pengajuan mitra", icon: FileCheck2 },
      { href: "/admin/partner-management", label: "Direktori mitra", icon: Store },
      { href: "/admin/partner-pricing", label: "Harga mitra", icon: BadgePercent },
    ],
  },
  {
    label: "Operasional",
    items: [
      { href: "/admin/order-management", label: "Pesanan", icon: ShoppingCart },
      { href: "/admin/payment-management", label: "Pembayaran", icon: CreditCard },
      { href: "/admin/event-management", label: "Acara", icon: CalendarDays },
      { href: "/admin/user-management", label: "Pengguna", icon: UsersRound },
      { href: "/admin/package-pricing", label: "Paket & harga", icon: Package },
      { href: "/admin/promotions", label: "Promosi & referral", icon: Gift },
      { href: "/admin/free-trial-management", label: "Uji coba gratis", icon: Images },
    ],
  },
  {
    label: "Analisis",
    items: [{ href: "/admin/reports", label: "Laporan", icon: ChartColumnIncreasing }],
  },
];

export function AdminShell({
  children,
  accountLabel,
}: {
  children: React.ReactNode;
  accountLabel: string;
}) {
  const pathname = usePathname();
  const currentPage = navGroups.flatMap((group) => group.items).find((item) =>
    item.href === "/admin"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <div className="min-h-screen bg-[#f7f5f1] text-charcoal">
      <div className="mx-auto grid max-w-[1680px] gap-4 p-3 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 lg:p-6">
        <aside className="overflow-hidden rounded-3xl border border-charcoal/10 bg-white shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="border-b border-charcoal/10 bg-[#fffaf5] px-5 py-5">
            <BrandLogo href="/admin" />
            <p className="mt-1 pl-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal/50">
              Pusat administrasi
            </p>
          </div>

          <nav
            aria-label="Navigasi administrator"
            className="max-h-[55vh] space-y-5 overflow-y-auto p-3 lg:max-h-[calc(100vh-14rem)]"
          >
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-charcoal/40">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = item.href === "/admin"
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-burgundy text-white shadow-sm"
                              : "text-charcoal/70 hover:bg-[#f7f2ec] hover:text-burgundy",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="hidden border-t border-charcoal/10 px-4 py-4 lg:block">
            <p className="truncate text-xs text-charcoal/55" title={accountLabel}>
              Masuk sebagai <span className="font-medium text-charcoal">{accountLabel}</span>
            </p>
            <div className="mt-2">
              <LogoutButton />
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="mb-4 flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-2xl border border-charcoal/10 bg-white px-4 py-3 shadow-sm sm:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal/45">
                OurLens · Administrasi
              </p>
              <h1 className="mt-0.5 text-sm font-semibold text-charcoal sm:text-base">
                {currentPage?.label ?? "Pusat administrasi"}
              </h1>
            </div>
            <div className="flex items-center gap-3 lg:hidden">
              <span className="max-w-40 truncate text-xs text-charcoal/60" title={accountLabel}>
                {accountLabel}
              </span>
              <LogoutButton />
            </div>
          </header>
          <div className="min-w-0 rounded-3xl border border-charcoal/10 bg-white p-4 shadow-sm sm:p-6 xl:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
