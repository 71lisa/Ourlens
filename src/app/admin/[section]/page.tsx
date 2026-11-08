import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, CircleCheck, Info } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  approvePartnerApplicationAction,
  rejectPartnerApplicationAction,
  savePartnerCustomPriceAction,
  togglePartnerAccountStatusAction,
} from "@/features/partners/admin-actions";
import { updatePackagePriceAction } from "@/features/packages/admin-actions";
import { updatePromotionSettingAction } from "@/features/promotions/actions";
import { cn } from "@/lib/cn";
import { getAdminSectionData } from "@/server/admin/queries";

function formatCurrency(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
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
    REWARDED: "Diberi hadiah",
    RESERVED: "Menunggu pembayaran",
    AVAILABLE: "Tersedia",
    USED: "Digunakan",
    FAILED: "Gagal",
    CANCELLED: "Dibatalkan",
    EXPIRED: "Kedaluwarsa",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
    ACTIVE: "Aktif",
    INACTIVE: "Nonaktif",
    SUSPENDED: "Ditangguhkan",
    DRAFT: "Draf",
    PUBLISHED: "Terbit",
    ARCHIVED: "Diarsipkan",
  };
  return labels[status] ?? "Status lainnya";
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "PAID" || status === "REWARDED" || status === "USED" || status === "AVAILABLE" || status === "APPROVED" || status === "ACTIVE" || status === "PUBLISHED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "PENDING" || status === "RESERVED"
        ? "bg-amber-50 text-amber-800"
        : status === "FAILED" || status === "REJECTED" || status === "CANCELLED" || status === "SUSPENDED" || status === "EXPIRED"
          ? "bg-rose-50 text-rose-700"
          : "bg-charcoal/5 text-charcoal/65";

  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", style)}>
      {formatStatus(status)}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-charcoal/10 pb-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-burgundy/70">{eyebrow}</p>
        <h2 className="mt-1 font-display text-3xl text-charcoal sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal/55">{description}</p>
      </div>
      {count !== undefined ? (
        <span className="rounded-full bg-[#f7f4ef] px-3 py-1.5 text-xs font-semibold text-charcoal/65">
          {count.toLocaleString("id-ID")} data
        </span>
      ) : null}
    </div>
  );
}

function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-charcoal/50">
        {children}
      </td>
    </tr>
  );
}

const tableClass = "min-w-full divide-y divide-charcoal/10 text-left text-sm";
const tableHeadClass = "bg-[#f8f6f2] text-[11px] font-semibold uppercase tracking-wide text-charcoal/55";
const tableCellClass = "px-4 py-3.5 align-middle";
const inputClass = "min-h-10 rounded-lg border border-charcoal/15 bg-white px-3 text-sm text-charcoal outline-none transition focus:border-burgundy focus:ring-2 focus:ring-burgundy/10";

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const { section } = await params;
  const query = await searchParams;
  const sections = new Set([
    "partner-applications",
    "partner-management",
    "partner-pricing",
    "order-management",
    "payment-management",
    "event-management",
    "user-management",
    "package-pricing",
    "promotions",
    "free-trial-management",
    "reports",
  ]);
  if (!sections.has(section)) notFound();

  const data = await getAdminSectionData(section);

  if (section === "partner-applications") {
    const applications = Array.isArray(data) ? data as Array<{
      id: string;
      businessName: string;
      contactName: string;
      contactPhone: string;
      businessType: string;
      status: string;
      createdAt: Date | string;
      adminNote?: string | null;
      applicant: { email: string; name?: string | null };
    }> : [];

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Kemitraan"
          title="Pengajuan mitra"
          description="Tinjau pendaftaran mitra penyelenggara pernikahan dan acara, lalu setujui atau tolak dengan catatan yang jelas."
          count={applications.length}
        />
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Usaha & kontak</th>
                <th className={tableCellClass}>Jenis</th>
                <th className={tableCellClass}>Telepon</th>
                <th className={tableCellClass}>Diajukan</th>
                <th className={tableCellClass}>Status</th>
                <th className={tableCellClass}>Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {applications.length ? applications.map((application) => (
                <tr key={application.id} className="transition-colors hover:bg-[#fcfaf7]">
                  <td className={tableCellClass}>
                    <p className="font-semibold text-charcoal">{application.businessName}</p>
                    <p className="mt-1 text-xs text-charcoal/60">{application.contactName}</p>
                    <p className="mt-0.5 text-xs text-charcoal/50">{application.applicant.email}</p>
                    {application.adminNote ? (
                      <p className="mt-2 max-w-xs text-xs leading-5 text-rose-700">Catatan: {application.adminNote}</p>
                    ) : null}
                  </td>
                  <td className={tableCellClass}>{application.businessType}</td>
                  <td className={tableCellClass}>{application.contactPhone}</td>
                  <td className={tableCellClass}>{formatDate(application.createdAt)}</td>
                  <td className={tableCellClass}><StatusBadge status={application.status} /></td>
                  <td className={tableCellClass}>
                    {application.status === "PENDING" ? (
                      <div className="flex min-w-48 flex-col items-start gap-2">
                        <form action={approvePartnerApplicationAction}>
                          <input type="hidden" name="applicationId" value={application.id} />
                          <Button type="submit" size="sm" className="gap-1.5">
                            <CircleCheck aria-hidden="true" className="size-4" />
                            Setujui
                          </Button>
                        </form>
                        <form action={rejectPartnerApplicationAction} className="flex flex-col gap-2">
                          <input type="hidden" name="applicationId" value={application.id} />
                          <input name="adminNote" className={cn(inputClass, "w-48")} placeholder="Alasan penolakan" />
                          <Button type="submit" variant="outline" size="sm" className="self-start">Tolak pengajuan</Button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-charcoal/45">Sudah ditinjau</span>
                    )}
                  </td>
                </tr>
              )) : <EmptyRow colSpan={6}>Belum ada pengajuan mitra.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
      </div>
    );
  }

  if (section === "partner-management") {
    type Partner = {
      id: string;
      businessName: string;
      createdAt: Date | string;
      paidOrderCount: number;
      status: string;
      user: { name?: string | null; email: string };
    };
    type Tier = { minPaidOrders: number; discountPercent: number };
    const [partners, tiers] = data as unknown as [Partner[], Tier[]];
    const activeCount = partners.filter((partner) => partner.status === "ACTIVE").length;

    return (
      <div className="space-y-5">
        {query.updated === "partner-status" ? (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Status mitra berhasil diperbarui.
          </p>
        ) : null}
        <SectionHeading
          eyebrow="Kemitraan"
          title="Direktori mitra"
          description="Pantau status akun, aktivitas pesanan berbayar, serta progres tingkat diskon setiap mitra."
          count={partners.length}
        />
        {partners.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Mitra terdaftar", value: partners.length },
              { label: "Mitra aktif", value: activeCount },
              { label: "Tingkat diskon aktif", value: tiers.length },
            ].map((item) => (
              <article key={item.label} className="rounded-xl border border-charcoal/10 bg-[#fbf9f6] p-4">
                <p className="text-xs text-charcoal/55">{item.label}</p>
                <p className="mt-2 font-display text-3xl text-charcoal">{item.value.toLocaleString("id-ID")}</p>
              </article>
            ))}
          </div>
        ) : null}
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Mitra</th>
                <th className={tableCellClass}>Bergabung</th>
                <th className={tableCellClass}>Pesanan berbayar</th>
                <th className={tableCellClass}>Progres tingkat diskon</th>
                <th className={tableCellClass}>Status</th>
                <th className={tableCellClass}>Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {partners.length ? partners.map((partner) => {
                const currentTier = tiers.reduce<Tier | null>(
                  (current, tier) => tier.minPaidOrders <= partner.paidOrderCount ? tier : current,
                  null,
                );
                const nextTier = tiers.find((tier) => tier.minPaidOrders > partner.paidOrderCount);
                return (
                  <tr key={partner.id} className="transition-colors hover:bg-[#fcfaf7]">
                    <td className={tableCellClass}>
                      <p className="font-semibold text-charcoal">{partner.businessName}</p>
                      <p className="mt-1 text-xs text-charcoal/55">{partner.user.name ?? partner.user.email}</p>
                    </td>
                    <td className={tableCellClass}>{formatDate(partner.createdAt)}</td>
                    <td className={tableCellClass}>
                      <span className="font-semibold tabular-nums text-charcoal">{partner.paidOrderCount.toLocaleString("id-ID")}</span>
                    </td>
                    <td className={tableCellClass}>
                      <p className="font-semibold text-charcoal">
                        {currentTier ? `${currentTier.discountPercent}% diskon` : "Tingkat awal"}
                      </p>
                      <p className="mt-1 text-xs text-charcoal/50">
                        {nextTier
                          ? `${Math.max(0, nextTier.minPaidOrders - partner.paidOrderCount)} pesanan lagi untuk ${nextTier.discountPercent}%`
                          : "Tingkat tertinggi tercapai"}
                      </p>
                    </td>
                    <td className={tableCellClass}><StatusBadge status={partner.status} /></td>
                    <td className={tableCellClass}>
                      <form action={togglePartnerAccountStatusAction}>
                        <input type="hidden" name="partnerAccountId" value={partner.id} />
                        <input type="hidden" name="status" value={partner.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                        <Button type="submit" variant={partner.status === "ACTIVE" ? "outline" : "primary"} size="sm">
                          {partner.status === "ACTIVE" ? "Tangguhkan" : "Aktifkan"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              }) : <EmptyRow colSpan={6}>Belum ada mitra terdaftar.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
      </div>
    );
  }

  if (section === "partner-pricing") {
    type Tier = { id: string; minPaidOrders: number; discountPercent: number };
    type PackageOption = { id: string; name: string; price: string | number; currency: string };
    type PartnerOption = { id: string; businessName: string };
    type Agreement = {
      id: string;
      active: boolean;
      startsAt: Date | string;
      endsAt?: Date | string | null;
      partnerAccount: { id: string; businessName: string };
      prices: Array<{ id: string; price: string | number; package: { id: string; name: string; price: string | number } }>;
    };
    const [tiers, agreements, packages, partners] = data as unknown as [Tier[], Agreement[], PackageOption[], PartnerOption[]];
    const now = new Date();
    const availablePackages = packages.filter((item) => item.currency === "IDR");

    return (
      <div className="space-y-6">
        <SectionHeading
          eyebrow="Kemitraan · harga"
          title="Harga dan diskon mitra"
          description="Pantau tingkat diskon standar dan kelola harga khusus mitra aktif melalui aturan harga yang sudah berlaku."
        />

        <section className="rounded-2xl border border-charcoal/10 bg-white p-5">
          <div className="mb-4">
            <h3 className="font-display text-2xl text-charcoal">Tingkat diskon standar</h3>
            <p className="mt-1 text-sm text-charcoal/55">Diskon bertambah mengikuti jumlah pesanan berbayar mitra.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiers.length ? tiers.map((tier, index) => (
              <article key={tier.id} className="rounded-xl border border-charcoal/10 bg-[#fbf9f6] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/45">
                  {index === 0 ? "Tingkat awal" : `Mulai ${tier.minPaidOrders} pesanan`}
                </p>
                <p className="mt-2 font-display text-3xl text-burgundy">{tier.discountPercent}%</p>
                <p className="mt-1 text-xs text-charcoal/55">{tier.minPaidOrders}+ pesanan berbayar</p>
              </article>
            )) : <p className="text-sm text-charcoal/55">Belum ada tier diskon aktif.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-charcoal/10 bg-white p-5">
          <div className="mb-4">
            <h3 className="font-display text-2xl text-charcoal">Atur harga khusus</h3>
            <p className="mt-1 text-sm text-charcoal/55">Simpan harga per paket untuk mitra tertentu. Pilih mitra dan paket yang akan diperbarui.</p>
          </div>
          {partners.length && availablePackages.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {partners.map((partner) => (
                <form key={partner.id} action={savePartnerCustomPriceAction} className="rounded-xl border border-charcoal/10 bg-[#fbf9f6] p-4">
                  <input type="hidden" name="partnerAccountId" value={partner.id} />
                  <p className="mb-3 font-semibold text-charcoal">{partner.businessName}</p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                    <select name="packageId" required defaultValue="" className={cn(inputClass, "min-w-0")}>
                      <option value="" disabled>Pilih paket</option>
                      {availablePackages.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} · {formatCurrency(item.price)}</option>
                      ))}
                    </select>
                    <input
                      name="price"
                      type="number"
                      min="1"
                      max="999999999"
                      step="1"
                      required
                      className={inputClass}
                      placeholder="Harga IDR"
                      aria-label={`Harga khusus untuk ${partner.businessName}`}
                    />
                    <Button type="submit" size="sm" className="min-h-10">Simpan</Button>
                  </div>
                </form>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-[#f8f6f2] px-4 py-5 text-sm text-charcoal/55">
              {partners.length ? "Belum ada paket aktif berdenominasi IDR." : "Belum ada mitra aktif untuk diberi harga khusus."}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-charcoal/10 bg-white p-5">
          <div className="mb-4">
            <h3 className="font-display text-2xl text-charcoal">Riwayat kesepakatan harga</h3>
            <p className="mt-1 text-sm text-charcoal/55">Harga yang tersimpan untuk mitra, termasuk periode berlakunya.</p>
          </div>
          <div className="space-y-3">
            {agreements.length ? agreements.map((agreement) => {
              const startsAt = new Date(agreement.startsAt);
              const endsAt = agreement.endsAt ? new Date(agreement.endsAt) : null;
              const current = agreement.active && startsAt <= now && (!endsAt || endsAt > now);
              const canManage = current && partners.some((partner) => partner.id === agreement.partnerAccount.id);
              return (
                <article key={agreement.id} className="rounded-xl border border-charcoal/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-charcoal">{agreement.partnerAccount.businessName}</p>
                      <p className="mt-1 text-xs text-charcoal/55">
                        {formatDate(agreement.startsAt)} – {agreement.endsAt ? formatDate(agreement.endsAt) : "Tanpa batas akhir"}
                      </p>
                    </div>
                    <StatusBadge status={current ? "ACTIVE" : "INACTIVE"} />
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {agreement.prices.length ? agreement.prices.map((price) => (
                      <div key={price.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8f6f2] p-3">
                        <div>
                          <p className="text-xs text-charcoal/55">{price.package.name}</p>
                          <p className="mt-1 text-sm font-semibold text-charcoal">{formatCurrency(price.price)}</p>
                          <p className="mt-0.5 text-xs text-charcoal/45">Harga katalog {formatCurrency(price.package.price)}</p>
                        </div>
                        {canManage ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <form action={savePartnerCustomPriceAction} className="flex items-center gap-2">
                              <input type="hidden" name="partnerAccountId" value={agreement.partnerAccount.id} />
                              <input type="hidden" name="packageId" value={price.package.id} />
                              <input
                                name="price"
                                type="number"
                                min="1"
                                max="999999999"
                                step="1"
                                required
                                defaultValue={Number(price.price)}
                                aria-label={`Ubah harga ${price.package.name}`}
                                className={cn(inputClass, "w-32")}
                              />
                              <Button type="submit" variant="outline" size="sm">Ubah</Button>
                            </form>
                            <form action={savePartnerCustomPriceAction}>
                              <input type="hidden" name="partnerAccountId" value={agreement.partnerAccount.id} />
                              <input type="hidden" name="packageId" value={price.package.id} />
                              <input type="hidden" name="remove" value="1" />
                              <Button type="submit" variant="ghost" size="sm">Hapus harga khusus</Button>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    )) : (
                      <p className="rounded-xl bg-[#f8f6f2] p-3 text-sm text-charcoal/50">Belum ada harga khusus pada kesepakatan ini.</p>
                    )}
                  </div>
                </article>
              );
            }) : <p className="rounded-xl bg-[#f8f6f2] px-4 py-6 text-center text-sm text-charcoal/50">Belum ada kesepakatan harga khusus.</p>}
          </div>
        </section>
      </div>
    );
  }

  if (section === "order-management") {
    const orders = Array.isArray(data) ? data as unknown as Array<{
      id: string;
      orderNumber: string;
      status: string;
      amount: string | number;
      baseAmount: string | number | null;
      discountAmount: string | number;
      promotionType: string | null;
      createdAt: Date | string;
      user: { name?: string | null; email: string };
      partnerAccount?: { businessName: string } | null;
      event?: { name: string } | null;
      package: { name: string };
      payments: Array<{ status: string }>;
    }> : [];

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Operasional"
          title="Semua pesanan"
          description="Pantau pesanan penyelenggara dan mitra, jumlah transaksi, serta status pembayaran terbarunya."
          count={orders.length}
        />
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Pesanan</th>
                <th className={tableCellClass}>Pemesan</th>
                <th className={tableCellClass}>Sumber</th>
                <th className={tableCellClass}>Paket / acara</th>
                <th className={tableCellClass}>Nominal</th>
                <th className={tableCellClass}>Status</th>
                <th className={tableCellClass}>Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {orders.length ? orders.map((order) => (
                <tr key={order.id} className="transition-colors hover:bg-[#fcfaf7]">
                  <td className={tableCellClass}><span className="font-semibold text-charcoal">{order.orderNumber}</span></td>
                  <td className={tableCellClass}>
                    <p className="font-medium text-charcoal">{order.user.name ?? "—"}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{order.user.email}</p>
                  </td>
                  <td className={tableCellClass}>{order.partnerAccount?.businessName ?? "Penyelenggara"}</td>
                  <td className={tableCellClass}>
                    <p className="font-medium text-charcoal">{order.event?.name ?? "Acara tanpa nama"}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{order.package.name}</p>
                  </td>
                  <td className={tableCellClass}>
                    <p className="whitespace-nowrap font-semibold">{formatCurrency(order.amount)}</p>
                    {Number(order.discountAmount) > 0 ? (
                      <p className="mt-1 whitespace-nowrap text-xs text-emerald-700">
                        {formatCurrency(order.baseAmount)} − {formatCurrency(order.discountAmount)}
                        <span className="block text-charcoal/50">
                          {order.promotionType === "FIRST_EVENT" ? "Diskon acara pertama" : "Voucher referral"}
                        </span>
                      </p>
                    ) : null}
                  </td>
                  <td className={tableCellClass}>
                    <StatusBadge status={order.status} />
                    {order.payments[0] ? <p className="mt-1.5 text-[11px] text-charcoal/50">Bayar: {formatStatus(order.payments[0].status)}</p> : null}
                  </td>
                  <td className={tableCellClass}>{formatDate(order.createdAt)}</td>
                </tr>
              )) : <EmptyRow colSpan={7}>Belum ada pesanan.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
      </div>
    );
  }

  if (section === "payment-management") {
    const payments = Array.isArray(data) ? data as unknown as Array<{
      id: string;
      provider: string;
      status: string;
      amount: string | number;
      updatedAt: Date | string;
      order: {
        orderNumber: string;
        user: { name?: string | null; email: string };
        event?: { name: string } | null;
        partnerAccount?: { businessName: string } | null;
      };
    }> : [];

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Operasional"
          title="Pemantauan pembayaran"
          description="Periksa nominal, penyedia pembayaran, status transaksi, dan pesanan terkait."
          count={payments.length}
        />
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Pesanan</th>
                <th className={tableCellClass}>Pelanggan</th>
                <th className={tableCellClass}>Penyedia</th>
                <th className={tableCellClass}>Nominal</th>
                <th className={tableCellClass}>Status</th>
                <th className={tableCellClass}>Diperbarui</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {payments.length ? payments.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-[#fcfaf7]">
                  <td className={tableCellClass}>
                    <p className="font-semibold text-charcoal">{payment.order.orderNumber}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{payment.order.event?.name ?? "Acara tanpa nama"}</p>
                  </td>
                  <td className={tableCellClass}>
                    <p className="font-medium text-charcoal">{payment.order.user.name ?? "—"}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{payment.order.user.email}</p>
                  </td>
                  <td className={tableCellClass}>{payment.provider === "MIDTRANS" ? "Midtrans" : payment.provider === "MOCK" ? "Simulasi" : "Lainnya"}</td>
                  <td className={tableCellClass}><span className="whitespace-nowrap font-semibold">{formatCurrency(payment.amount)}</span></td>
                  <td className={tableCellClass}><StatusBadge status={payment.status} /></td>
                  <td className={tableCellClass}>{formatDate(payment.updatedAt)}</td>
                </tr>
              )) : <EmptyRow colSpan={6}>Belum ada aktivitas pembayaran.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
      </div>
    );
  }

  if (section === "event-management") {
    const events = Array.isArray(data) ? data as Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      createdAt: Date | string;
      owner: { name?: string | null; email: string };
      package?: { name?: string | null } | null;
      qrCode?: { active: boolean; scanCount: number } | null;
      _count: { mediaAssets: number; memories: number };
    }> : [];

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Operasional"
          title="Pemantauan acara"
          description="Lihat pemilik acara, paket, status publikasi, penggunaan QR, dan aktivitas galeri."
          count={events.length}
        />
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Acara</th>
                <th className={tableCellClass}>Pemilik</th>
                <th className={tableCellClass}>Paket</th>
                <th className={tableCellClass}>Status</th>
                <th className={tableCellClass}>QR & galeri</th>
                <th className={tableCellClass}>Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {events.length ? events.map((event) => (
                <tr key={event.id} className="transition-colors hover:bg-[#fcfaf7]">
                  <td className={tableCellClass}>
                    <Link href={`/e/${event.slug}`} target="_blank" className="group inline-flex items-center gap-1 font-semibold text-charcoal hover:text-burgundy">
                      {event.name}
                      <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-40 group-hover:opacity-100" />
                    </Link>
                    <p className="mt-1 text-xs text-charcoal/45">/{event.slug}</p>
                  </td>
                  <td className={tableCellClass}>
                    <p className="font-medium text-charcoal">{event.owner.name ?? "—"}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{event.owner.email}</p>
                  </td>
                  <td className={tableCellClass}>{event.package?.name ?? "—"}</td>
                  <td className={tableCellClass}><StatusBadge status={event.status} /></td>
                  <td className={tableCellClass}>
                    <p className="text-xs text-charcoal/65">
                      QR {event.qrCode?.active ? "aktif" : "belum aktif"}
                      {event.qrCode ? ` · ${event.qrCode.scanCount.toLocaleString("id-ID")} pemindaian` : ""}
                    </p>
                    <p className="mt-1 text-xs text-charcoal/50">
                      {event._count.mediaAssets.toLocaleString("id-ID")} berkas media · {event._count.memories.toLocaleString("id-ID")} kontribusi
                    </p>
                  </td>
                  <td className={tableCellClass}>{formatDate(event.createdAt)}</td>
                </tr>
              )) : <EmptyRow colSpan={6}>Belum ada acara.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
        <p className="text-xs text-charcoal/45">Menampilkan maksimal 50 acara terbaru.</p>
      </div>
    );
  }

  if (section === "user-management") {
    const users = Array.isArray(data) ? data as Array<{
      id: string;
      email: string;
      name?: string | null;
      role: string;
      createdAt: Date | string;
      _count: { orders: number; ownedEvents: number };
    }> : [];
    const roleLabels: Record<string, string> = {
      ADMIN: "Administrator",
      ORGANIZER: "Penyelenggara",
      PARTNER: "Mitra",
      GUEST: "Tamu",
    };

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Operasional"
          title="Pengguna platform"
          description="Pantau akun administrator, penyelenggara, mitra, dan pengguna lain beserta aktivitas dasar mereka."
          count={users.length}
        />
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Pengguna</th>
                <th className={tableCellClass}>Peran</th>
                <th className={tableCellClass}>Acara</th>
                <th className={tableCellClass}>Pesanan</th>
                <th className={tableCellClass}>Terdaftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {users.length ? users.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-[#fcfaf7]">
                  <td className={tableCellClass}>
                    <p className="font-semibold text-charcoal">{user.name ?? "Tanpa nama"}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{user.email}</p>
                  </td>
                  <td className={tableCellClass}>
                    <span className="inline-flex rounded-full bg-charcoal/5 px-2.5 py-1 text-xs font-medium text-charcoal/65">
                      {roleLabels[user.role] ?? "Peran lainnya"}
                    </span>
                  </td>
                  <td className={tableCellClass}>{user._count.ownedEvents.toLocaleString("id-ID")}</td>
                  <td className={tableCellClass}>{user._count.orders.toLocaleString("id-ID")}</td>
                  <td className={tableCellClass}>{formatDate(user.createdAt)}</td>
                </tr>
              )) : <EmptyRow colSpan={5}>Belum ada data pengguna.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
        <p className="text-xs text-charcoal/45">Menampilkan maksimal 50 pengguna terbaru.</p>
      </div>
    );
  }

  if (section === "package-pricing") {
    const packages = Array.isArray(data) ? data as unknown as Array<{
      id: string;
      name: string;
      price: string | number;
      currency: string;
      guestCapacity?: number | null;
      isUnlimited: boolean;
      isActive: boolean;
    }> : [];

    return (
      <div className="space-y-5">
        {query.updated === "package-price" ? (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Harga paket berhasil diperbarui. Harga baru digunakan untuk pesanan berikutnya.
          </p>
        ) : null}
        {query.error === "invalid-package-price" || query.error === "package-not-found" || query.error === "save-package-price" ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {query.error === "invalid-package-price"
              ? "Harga tidak valid. Masukkan nominal IDR berupa bilangan bulat yang lebih besar dari 0."
              : query.error === "package-not-found"
                ? "Paket tidak ditemukan. Muat ulang halaman dan coba kembali."
                : "Harga paket tidak dapat disimpan. Coba kembali."}
          </p>
        ) : null}
        <SectionHeading
          eyebrow="Katalog"
          title="Paket & harga layanan"
          description="Atur harga katalog layanan OurLens. Perubahan berlaku untuk pemesanan baru; paket pada pesanan yang sudah dibuat tetap menggunakan harga tersimpan."
          count={packages.length}
        />
        <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-5 text-sky-900">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Harga paket memengaruhi harga untuk pesanan berikutnya. Kapasitas tamu, fitur paket, serta harga dan diskon khusus partner tidak berubah.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {packages.length ? packages.map((item) => (
            <article key={item.id} className="rounded-2xl border border-charcoal/10 bg-white p-5 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/45">Paket layanan</p>
                  <h3 className="mt-1 font-display text-2xl text-charcoal">{item.name}</h3>
                </div>
                <StatusBadge status={item.isActive ? "ACTIVE" : "INACTIVE"} />
              </div>
              <p className="mt-5 font-display text-3xl text-burgundy">{formatCurrency(item.price)}</p>
              <dl className="mt-4 space-y-2 border-t border-charcoal/10 pt-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-charcoal/55">Kapasitas</dt>
                  <dd className="font-medium text-charcoal">{item.isUnlimited ? "Tidak terbatas" : `${(item.guestCapacity ?? 0).toLocaleString("id-ID")} tamu`}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-charcoal/55">Mata uang</dt>
                  <dd className="font-medium text-charcoal">{item.currency}</dd>
                </div>
              </dl>
              <form action={updatePackagePriceAction} className="mt-5 border-t border-charcoal/10 pt-4">
                <input type="hidden" name="packageId" value={item.id} />
                <label htmlFor={`package-price-${item.id}`} className="text-xs font-medium text-charcoal/65">
                  Harga baru ({item.currency})
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id={`package-price-${item.id}`}
                    name="price"
                    type="number"
                    min="1"
                    max="9999999999"
                    step="1"
                    required
                    defaultValue={Number(item.price)}
                    className={cn(inputClass, "min-w-0 flex-1")}
                  />
                  <Button type="submit" size="sm" className="min-h-10 shrink-0">Simpan harga</Button>
                </div>
              </form>
            </article>
          )) : (
            <p className="rounded-xl border border-charcoal/10 bg-[#fbf9f6] px-4 py-8 text-center text-sm text-charcoal/50 sm:col-span-2 xl:col-span-3">
              Belum ada paket layanan.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (section === "promotions") {
    const [settings, referrals, vouchers, firstEventUsage] = data as unknown as [
      { firstEventActive: boolean; referralActive: boolean } | null,
      Array<{
        id: string;
        referralCode: string;
        status: string;
        createdAt: Date;
        rewardedAt: Date | null;
        referrer: { name: string | null; email: string };
        referred: { name: string | null; email: string };
        voucher: { amount: number | string; status: string; expiresAt: Date; usedAt: Date | null } | null;
      }>,
      Array<{
        id: string;
        amount: number | string;
        status: string;
        createdAt: Date;
        expiresAt: Date;
        usedAt: Date | null;
        owner: { name: string | null; email: string };
        referral: {
          referralCode: string;
          referred: { name: string | null; email: string };
        };
      }>,
      Array<{ status: string; _count: { id: number } }>,
    ];
    const firstEventActive = settings?.firstEventActive ?? true;
    const referralActive = settings?.referralActive ?? true;

    return (
      <div className="space-y-5">
        {query.updated === "1" ? (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Pengaturan promosi berhasil diperbarui.
          </p>
        ) : null}
        {query.error === "invalid-setting" ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Pengaturan promosi tidak valid. Muat ulang halaman dan coba kembali.
          </p>
        ) : null}
        <SectionHeading
          eyebrow="Akuisisi pengguna"
          title="Promosi & referral"
          description="Atur promosi pembelian acara pertama dan referral. Hadiah referral diberikan otomatis setelah pembayaran pertama pengguna baru terverifikasi."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            {
              name: "firstEventActive",
              title: "Diskon acara pertama",
              description: "Diskon 15% otomatis untuk pembelian acara pertama penyelenggara biasa.",
              active: firstEventActive,
            },
            {
              name: "referralActive",
              title: "Promosi referral",
              description: "Voucher Rp20.000 untuk pemberi referral setelah pembayaran pertama pengguna baru terverifikasi.",
              active: referralActive,
            },
          ].map((promotion) => (
            <article key={promotion.name} className="rounded-2xl border border-charcoal/10 bg-[#fbf9f6] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl text-charcoal">{promotion.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-charcoal/60">{promotion.description}</p>
                </div>
                <StatusBadge status={promotion.active ? "ACTIVE" : "INACTIVE"} />
              </div>
              <form action={updatePromotionSettingAction} className="mt-5">
                <input type="hidden" name="setting" value={promotion.name} />
                <input type="hidden" name="enabled" value={String(!promotion.active)} />
                <Button type="submit" size="sm" variant={promotion.active ? "outline" : "primary"}>
                  {promotion.active ? "Nonaktifkan promo" : "Aktifkan promo"}
                </Button>
              </form>
            </article>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Diskon acara pertama diterapkan",
              value: firstEventUsage.reduce((sum, item) => sum + item._count.id, 0),
            },
            { label: "Pendaftaran referral", value: referrals.length },
            { label: "Hadiah terverifikasi", value: referrals.filter((item) => item.status === "REWARDED").length },
            { label: "Voucher diterbitkan", value: vouchers.length },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-charcoal/10 bg-white p-4">
              <p className="text-xs text-charcoal/55">{item.label}</p>
              <p className="mt-2 font-display text-3xl text-charcoal">{item.value.toLocaleString("id-ID")}</p>
            </article>
          ))}
        </div>
        <section className="space-y-3">
          <h3 className="font-display text-2xl text-charcoal">Aktivitas referral</h3>
          <TableFrame>
            <table className={tableClass}>
              <thead className={tableHeadClass}>
                <tr>
                  <th className={tableCellClass}>Kode</th>
                  <th className={tableCellClass}>Pemberi referral</th>
                  <th className={tableCellClass}>Pengguna baru</th>
                  <th className={tableCellClass}>Tanggal daftar</th>
                  <th className={tableCellClass}>Hadiah</th>
                  <th className={tableCellClass}>Voucher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/10">
                {referrals.length ? referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className={tableCellClass}><span className="font-mono text-xs">{referral.referralCode}</span></td>
                    <td className={tableCellClass}>
                      <p className="font-medium">{referral.referrer.name ?? "Tanpa nama"}</p>
                      <p className="mt-1 text-xs text-charcoal/50">{referral.referrer.email}</p>
                    </td>
                    <td className={tableCellClass}>
                      <p className="font-medium">{referral.referred.name ?? "Tanpa nama"}</p>
                      <p className="mt-1 text-xs text-charcoal/50">{referral.referred.email}</p>
                    </td>
                    <td className={tableCellClass}>{formatDate(referral.createdAt)}</td>
                    <td className={tableCellClass}><StatusBadge status={referral.status} /></td>
                    <td className={tableCellClass}>
                      {referral.voucher
                        ? `${formatCurrency(referral.voucher.amount)} · ${formatStatus(referral.voucher.status)}`
                        : "Belum diterbitkan"}
                    </td>
                  </tr>
                )) : <EmptyRow colSpan={6}>Belum ada aktivitas referral.</EmptyRow>}
              </tbody>
            </table>
          </TableFrame>
        </section>
        <section className="space-y-3">
          <h3 className="font-display text-2xl text-charcoal">Voucher yang diterbitkan</h3>
          <TableFrame>
            <table className={tableClass}>
              <thead className={tableHeadClass}>
                <tr>
                  <th className={tableCellClass}>Penerima</th>
                  <th className={tableCellClass}>Referral</th>
                  <th className={tableCellClass}>Nilai</th>
                  <th className={tableCellClass}>Status</th>
                  <th className={tableCellClass}>Berlaku hingga</th>
                  <th className={tableCellClass}>Diterbitkan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/10">
                {vouchers.length ? vouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td className={tableCellClass}>
                      <p className="font-medium">{voucher.owner.name ?? "Tanpa nama"}</p>
                      <p className="mt-1 text-xs text-charcoal/50">{voucher.owner.email}</p>
                    </td>
                    <td className={tableCellClass}>
                      <p className="font-mono text-xs">{voucher.referral.referralCode}</p>
                      <p className="mt-1 text-xs text-charcoal/50">{voucher.referral.referred.email}</p>
                    </td>
                    <td className={tableCellClass}>{formatCurrency(voucher.amount)}</td>
                    <td className={tableCellClass}><StatusBadge status={voucher.status} /></td>
                    <td className={tableCellClass}>{formatDate(voucher.expiresAt)}</td>
                    <td className={tableCellClass}>{formatDate(voucher.createdAt)}</td>
                  </tr>
                )) : <EmptyRow colSpan={6}>Belum ada voucher diterbitkan.</EmptyRow>}
              </tbody>
            </table>
          </TableFrame>
          <p className="text-xs text-charcoal/45">Voucher referral berlaku enam bulan sejak diterbitkan.</p>
        </section>
      </div>
    );
  }

  if (section === "free-trial-management") {
    const trials = Array.isArray(data) ? data as Array<{
      id: string;
      photoLimit: number;
      createdAt: Date;
      user: { name: string | null; email: string };
      event: { name: string; slug: string; mediaAssets: Array<{ id: string }> };
    }> : [];

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Penggunaan produk"
          title="Pemantauan uji coba gratis"
          description="Pantau penyelenggara yang telah menggunakan acara demo uji coba gratis dan kuota foto yang sudah dipakai. Uji coba tidak membuat pesanan atau pembayaran."
          count={trials.length}
        />
        <TableFrame>
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>Penyelenggara</th>
                <th className={tableCellClass}>Acara demo</th>
                <th className={tableCellClass}>Foto</th>
                <th className={tableCellClass}>Digunakan sejak</th>
                <th className={tableCellClass}>Galeri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {trials.length ? trials.map((trial) => (
                <tr key={trial.id}>
                  <td className={tableCellClass}>
                    <p className="font-medium">{trial.user.name ?? "Tanpa nama"}</p>
                    <p className="mt-1 text-xs text-charcoal/50">{trial.user.email}</p>
                  </td>
                  <td className={tableCellClass}>{trial.event.name}</td>
                  <td className={tableCellClass}>
                    {trial.event.mediaAssets.length} / {trial.photoLimit}
                    <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-charcoal/10">
                      <div
                        className="h-full rounded-full bg-burgundy"
                        style={{ width: `${Math.min(100, trial.event.mediaAssets.length / trial.photoLimit * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className={tableCellClass}>{formatDate(trial.createdAt)}</td>
                  <td className={tableCellClass}>
                    <Link href={`/e/${encodeURIComponent(trial.event.slug)}/gallery`} className="text-xs font-semibold text-burgundy hover:underline">
                      Buka galeri
                    </Link>
                  </td>
                </tr>
              )) : <EmptyRow colSpan={5}>Belum ada akun yang menggunakan uji coba gratis.</EmptyRow>}
            </tbody>
          </table>
        </TableFrame>
      </div>
    );
  }

  if (section === "reports") {
    type OrderStatusCount = { status: string; _count: { id: number } };
    type TopPartner = { businessName: string; paidOrderCount: number; status: string };
    type RevenueAggregate = { _sum: { amount: number | null } };
    const [ordersByStatus, topPartners, revenue, userGrowth] = data as unknown as [
      OrderStatusCount[],
      TopPartner[],
      RevenueAggregate,
      [number, number],
    ];
    const totalOrders = ordersByStatus.reduce((sum, item) => sum + item._count.id, 0);
    const [newUsersThisMonth, newUsersLastMonth] = userGrowth;
    const userGrowthDifference = newUsersThisMonth - newUsersLastMonth;

    return (
      <div className="space-y-5">
        <SectionHeading
          eyebrow="Analisis"
          title="Laporan platform"
          description="Ringkasan pendapatan, jumlah dan status pesanan, pertumbuhan pengguna, serta performa mitra."
        />
        <p className="text-xs text-charcoal/50">Pendapatan dan jumlah pesanan merupakan akumulasi seluruh data.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pendapatan terbayar", value: formatCurrency(Number(revenue._sum.amount ?? 0)) },
            { label: "Semua pesanan", value: totalOrders.toLocaleString("id-ID") },
            { label: "Pengguna baru bulan ini", value: newUsersThisMonth.toLocaleString("id-ID") },
            { label: "Perubahan dari bulan lalu", value: `${userGrowthDifference >= 0 ? "+" : ""}${userGrowthDifference.toLocaleString("id-ID")}` },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-charcoal/10 bg-[#fbf9f6] p-4 sm:p-5">
              <p className="text-xs text-charcoal/55">{item.label}</p>
              <p className="mt-3 break-words font-display text-2xl text-charcoal sm:text-3xl">{item.value}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-charcoal/10 bg-white p-5">
            <h3 className="font-display text-2xl text-charcoal">Pesanan berdasarkan status</h3>
            <div className="mt-4 space-y-2">
              {ordersByStatus.length ? ordersByStatus.map((item) => (
                <div key={item.status} className="flex items-center justify-between rounded-xl bg-[#f8f6f2] px-4 py-3">
                  <StatusBadge status={item.status} />
                  <span className="font-semibold tabular-nums text-charcoal">{item._count.id.toLocaleString("id-ID")}</span>
                </div>
              )) : <p className="rounded-xl bg-[#f8f6f2] px-4 py-6 text-sm text-charcoal/50">Belum ada data pesanan.</p>}
            </div>
          </section>
          <section className="rounded-2xl border border-charcoal/10 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl text-charcoal">Mitra dengan pesanan tertinggi</h3>
                <p className="mt-1 text-sm text-charcoal/55">Diurutkan menurut pesanan berbayar.</p>
              </div>
              <Link href="/admin/partner-management" className="text-xs font-semibold text-burgundy hover:underline">Direktori mitra</Link>
            </div>
            <div className="mt-4 space-y-2">
              {topPartners.length ? topPartners.map((partner, index) => (
                <div key={partner.businessName} className="flex items-center justify-between gap-3 rounded-xl bg-[#f8f6f2] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-charcoal/55">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-charcoal">{partner.businessName}</p>
                      <p className="mt-0.5 text-xs text-charcoal/50">{formatStatus(partner.status)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-burgundy/10 px-2.5 py-1 text-xs font-semibold text-burgundy">
                    {partner.paidOrderCount.toLocaleString("id-ID")} pesanan
                  </span>
                </div>
              )) : <p className="rounded-xl bg-[#f8f6f2] px-4 py-6 text-sm text-charcoal/50">Belum ada aktivitas mitra.</p>}
            </div>
          </section>
        </div>
      </div>
    );
  }

  notFound();
}
