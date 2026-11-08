import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Handshake,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import { auth } from "@/auth";
import { cn } from "@/lib/cn";
import { getAdminDashboardData, getDateRange } from "@/server/admin/queries";

type ChartPoint = { label: string; value: number };
type ChartEntry = { date: Date; value: number };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Menunggu",
    PAID: "Berhasil",
    FAILED: "Gagal",
    CANCELLED: "Dibatalkan",
    EXPIRED: "Kedaluwarsa",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
  };
  return labels[status] ?? "Status lainnya";
}

function buildBuckets(range: { start: Date; end: Date }, items: ChartEntry[]): ChartPoint[] {
  const rangeMs = Math.max(1, range.end.getTime() - range.start.getTime() + 1);
  const bucketCount = Math.min(7, Math.max(1, Math.ceil(rangeMs / (24 * 60 * 60 * 1000))));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketDate = new Date(range.start.getTime() + (rangeMs * index) / bucketCount);
    return {
      label: bucketDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      value: 0,
    };
  });

  for (const item of items) {
    const elapsed = item.date.getTime() - range.start.getTime();
    const index = Math.max(0, Math.min(bucketCount - 1, Math.floor((elapsed / rangeMs) * bucketCount)));
    buckets[index].value += item.value;
  }

  return buckets;
}

function ActivityChart({
  title,
  description,
  points,
  color,
  formatValue,
}: {
  title: string;
  description: string;
  points: ChartPoint[];
  color: string;
  formatValue: (value: number) => string;
}) {
  const maximum = Math.max(...points.map((point) => point.value), 1);

  return (
    <section className="rounded-2xl border border-charcoal/10 bg-white p-5 sm:p-6">
      <div className="mb-6">
        <h2 className="font-display text-2xl text-charcoal">{title}</h2>
        <p className="mt-1 text-sm text-charcoal/55">{description}</p>
      </div>
      <div className="flex h-52 items-end gap-2 sm:gap-3" role="img" aria-label={`${title}: ${points.map((point) => `${point.label} ${formatValue(point.value)}`).join(", ")}`}>
        {points.map((point) => {
          const height = point.value === 0 ? 3 : Math.max(9, (point.value / maximum) * 100);
          return (
            <div key={point.label} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="max-w-full truncate text-[10px] font-medium text-charcoal/60 sm:text-xs">{formatValue(point.value)}</span>
              <div className="flex h-36 w-full items-end">
                <div
                  className={cn("w-full rounded-t-lg transition-opacity group-hover:opacity-80", color)}
                  style={{ height: `${height}%` }}
                  title={`${point.label}: ${formatValue(point.value)}`}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] text-charcoal/50 sm:text-xs">{point.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "PAID" || status === "APPROVED" || status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700"
      : status === "PENDING"
        ? "bg-amber-50 text-amber-800"
        : status === "FAILED" || status === "REJECTED" || status === "CANCELLED"
          ? "bg-rose-50 text-rose-700"
          : "bg-charcoal/5 text-charcoal/65";

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", styles)}>
      {formatStatus(status)}
    </span>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    start?: string;
    end?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const params = await searchParams;
  const range = getDateRange(params.period, params.start, params.end);
  const dashboard = await getAdminDashboardData(range);
  const revenueSeries = buildBuckets(range, dashboard.revenueSeries.map((item) => ({
    date: item.createdAt,
    value: Number(item._sum.amount ?? 0),
  })));
  const orderSeries = buildBuckets(range, dashboard.orderSeries.map((item) => ({
    date: item.createdAt,
    value: item._count.id,
  })));
  const periodOptions = [
    { value: "7", label: "7 hari" },
    { value: "30", label: "30 hari" },
    { value: "90", label: "3 bulan" },
    { value: "365", label: "12 bulan" },
  ];
  const selectedPeriod = params.start && params.end
    ? null
    : periodOptions.some((item) => item.value === params.period)
      ? params.period
      : "30";
  const updateMessages: Record<string, string> = {
    approved: "Pengajuan mitra berhasil disetujui.",
    rejected: "Pengajuan mitra berhasil ditolak.",
    price: "Harga khusus mitra berhasil diperbarui.",
  };
  const errorMessages: Record<string, string> = {
    invalid: "Permintaan tidak valid. Muat ulang halaman dan coba lagi.",
    approve: "Pengajuan tidak dapat disetujui. Periksa status pengajuan.",
    reject: "Perubahan tidak dapat disimpan. Muat ulang halaman lalu coba kembali.",
    "not-pending": "Pengajuan ini sudah tidak menunggu peninjauan.",
    "invalid-price": "Harga mitra tidak valid.",
    "save-price": "Harga khusus mitra tidak dapat disimpan.",
  };

  return (
    <div className="space-y-8">
      {params.updated && updateMessages[params.updated] ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {updateMessages[params.updated]}
        </p>
      ) : null}
      {params.error && errorMessages[params.error] ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessages[params.error]}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-[#3c1722] p-5 text-white sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Ringkasan operasional</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl">Pantau OurLens dari satu tempat.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">
              Tinjau kemitraan, aktivitas pesanan, pembayaran, dan perkembangan platform tanpa masuk ke ruang kerja penyelenggara.
            </p>
          </div>
          <Link
            href="/admin/partner-applications"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-burgundy transition hover:bg-[#fff4e8]"
          >
            Tinjau pengajuan
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="monitor-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="monitor-heading" className="font-display text-2xl text-charcoal">Yang perlu dipantau</h2>
            <p className="mt-1 text-sm text-charcoal/55">Ringkasan status platform saat ini.</p>
          </div>
          <span className="text-xs text-charcoal/50">Jumlah keseluruhan</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Pengguna terdaftar",
              value: dashboard.stats.userCount,
              href: "/admin/user-management",
              icon: UsersRound,
              accent: "bg-[#f3f5ff] text-indigo-700",
            },
            {
              label: "Mitra aktif",
              value: dashboard.stats.activePartners,
              href: "/admin/partner-management",
              icon: Handshake,
              accent: "bg-emerald-50 text-emerald-700",
            },
            {
              label: "Pengajuan menunggu",
              value: dashboard.stats.pendingApplications,
              href: "/admin/partner-applications",
              icon: ArrowDownRight,
              accent: "bg-amber-50 text-amber-800",
              urgent: dashboard.stats.pendingApplications > 0,
            },
            {
              label: "Acara dibuat",
              value: dashboard.stats.totalEvents,
              href: "/admin/event-management",
              icon: CalendarDays,
              accent: "bg-[#fff4ea] text-burgundy",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm sm:p-5",
                  item.urgent ? "border-amber-300 bg-amber-50/60" : "border-charcoal/10 bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-charcoal/60">{item.label}</span>
                  <span className={cn("grid size-9 place-items-center rounded-xl", item.accent)}>
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <span className="font-display text-4xl leading-none text-charcoal">{item.value.toLocaleString("id-ID")}</span>
                  <ArrowUpRight aria-hidden="true" className="size-4 text-charcoal/35 transition group-hover:text-burgundy" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="performance-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="performance-heading" className="font-display text-2xl text-charcoal">Performa layanan</h2>
            <p className="mt-1 text-sm text-charcoal/55">Pendapatan dan jumlah pesanan pada rentang pilihan.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-[#f7f5f1] p-1">
            {periodOptions.map((item) => (
              <Link
                key={item.value}
                href={{ pathname: "/admin", query: { period: item.value } }}
                aria-current={selectedPeriod === item.value ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm",
                  selectedPeriod === item.value
                    ? "bg-burgundy text-white shadow-sm"
                    : "text-charcoal/65 hover:bg-white hover:text-charcoal",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Pendapatan terbayar · periode ini", value: formatCurrency(dashboard.stats.revenue), icon: CreditCard },
            { label: "Semua pesanan", value: dashboard.stats.totalOrders.toLocaleString("id-ID"), icon: ShoppingCart },
            { label: "Pembayaran berhasil", value: dashboard.stats.successfulPayments.toLocaleString("id-ID"), icon: CreditCard },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-2xl border border-charcoal/10 bg-[#fffaf5] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-charcoal/55">
                  <Icon aria-hidden="true" className="size-4" />
                  <p className="text-xs font-medium sm:text-sm">{item.label}</p>
                </div>
                <p className="mt-3 font-display text-2xl text-charcoal sm:text-3xl">{item.value}</p>
              </article>
            );
          })}
        </div>

        <p className="mb-3 text-xs text-charcoal/50">Rentang pendapatan: {range.label}</p>
        <div className="grid gap-4 xl:grid-cols-2">
          <ActivityChart
            title="Pendapatan"
            description="Hanya pesanan berstatus terbayar."
            points={revenueSeries}
            color="bg-burgundy/80"
            formatValue={formatCurrency}
          />
          <ActivityChart
            title="Volume pesanan"
            description="Pesanan yang dibuat pada rentang ini."
            points={orderSeries}
            color="bg-[#dca765]"
            formatValue={(value) => value.toLocaleString("id-ID")}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-charcoal/10 bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-charcoal">Status pembayaran</h2>
              <p className="mt-1 text-sm text-charcoal/55">Distribusi seluruh transaksi.</p>
            </div>
            <Link href="/admin/payment-management" className="text-xs font-semibold text-burgundy hover:underline">
              Semua pembayaran
            </Link>
          </div>
          <div className="space-y-2">
            {dashboard.paymentSummary.length ? dashboard.paymentSummary.map((item) => (
              <div key={item.status} className="flex items-center justify-between rounded-xl bg-[#f8f6f2] px-4 py-3">
                <StatusPill status={item.status} />
                <span className="text-sm font-semibold tabular-nums text-charcoal">{item.count.toLocaleString("id-ID")}</span>
              </div>
            )) : <p className="rounded-xl bg-[#f8f6f2] px-4 py-5 text-sm text-charcoal/55">Belum ada data pembayaran.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-charcoal/10 bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-charcoal">Mitra dengan pesanan terbanyak</h2>
              <p className="mt-1 text-sm text-charcoal/55">Berdasarkan jumlah pesanan berbayar.</p>
            </div>
            <Link href="/admin/partner-management" className="text-xs font-semibold text-burgundy hover:underline">
              Direktori
            </Link>
          </div>
          <div className="space-y-2">
            {dashboard.topPartners.length ? dashboard.topPartners.map((partner, index) => (
              <div key={partner.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f8f6f2] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-charcoal/55">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal">{partner.businessName}</p>
                    <p className="mt-0.5 text-xs text-charcoal/50">{partner.status === "ACTIVE" ? "Aktif" : formatStatus(partner.status)}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-burgundy/10 px-2.5 py-1 text-xs font-semibold text-burgundy">
                  {partner.paidOrderCount.toLocaleString("id-ID")} pesanan
                </span>
              </div>
            )) : <p className="rounded-xl bg-[#f8f6f2] px-4 py-5 text-sm text-charcoal/55">Belum ada aktivitas mitra.</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-charcoal/10 px-5 py-4">
            <div>
              <h2 className="font-display text-2xl text-charcoal">Pengajuan terbaru</h2>
              <p className="mt-1 text-xs text-charcoal/50">Pendaftaran WO/EO yang perlu ditinjau.</p>
            </div>
            <Link href="/admin/partner-applications" className="text-xs font-semibold text-burgundy hover:underline">
              Lihat semua
            </Link>
          </div>
          <div className="divide-y divide-charcoal/10">
            {dashboard.recentApplications.length ? dashboard.recentApplications.map((application) => (
              <div key={application.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-charcoal">{application.businessName}</p>
                  <p className="mt-1 truncate text-xs text-charcoal/55">
                    {application.applicant.name ?? application.applicant.email} · {formatDate(application.createdAt)}
                  </p>
                </div>
                <StatusPill status={application.status} />
              </div>
            )) : <p className="px-5 py-6 text-sm text-charcoal/55">Belum ada pengajuan mitra.</p>}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-charcoal/10 px-5 py-4">
            <div>
              <h2 className="font-display text-2xl text-charcoal">Pesanan terbaru</h2>
              <p className="mt-1 text-xs text-charcoal/50">Aktivitas penyelenggara dan mitra.</p>
            </div>
            <Link href="/admin/order-management" className="text-xs font-semibold text-burgundy hover:underline">
              Lihat semua
            </Link>
          </div>
          <div className="divide-y divide-charcoal/10">
            {dashboard.recentOrders.length ? dashboard.recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-charcoal">{order.orderNumber}</p>
                  <p className="mt-1 truncate text-xs text-charcoal/55">
                    {order.partnerAccount?.businessName ?? order.user.name ?? order.user.email} · {order.event?.name ?? "Acara tanpa nama"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-charcoal">{formatCurrency(Number(order.amount))}</p>
                  <div className="mt-1"><StatusPill status={order.status} /></div>
                </div>
              </div>
            )) : <p className="px-5 py-6 text-sm text-charcoal/55">Belum ada pesanan.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
