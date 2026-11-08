import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { ReferralShare } from "@/features/promotions/referral-share";
import { publicEnv } from "@/lib/env";
import { prisma } from "@/server/db/prisma";

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ORGANIZER") redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { referralCode: true },
  });
  let referralCode = user.referralCode;
  if (!referralCode) {
    await prisma.user.updateMany({
      where: { id: session.user.id, referralCode: null },
      data: { referralCode: `OL-${randomBytes(12).toString("hex").toUpperCase()}` },
    });
    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { referralCode: true },
    });
    referralCode = updatedUser.referralCode;
  }
  if (!referralCode) throw new Error("Kode referral tidak dapat dibuat untuk akun ini.");

  const now = new Date();
  await prisma.referralVoucher.updateMany({
    where: { ownerId: session.user.id, status: "AVAILABLE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  const referrals = await prisma.referral.findMany({
    where: { referrerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      referred: { select: { name: true, email: true } },
      voucher: { select: { amount: true, status: true, expiresAt: true, usedAt: true } },
    },
  });
  const vouchers = await prisma.referralVoucher.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      referral: { select: { referred: { select: { name: true, email: true } } } },
    },
  });
  const shareUrl = new URL(
    `/register?ref=${encodeURIComponent(referralCode)}`,
    publicEnv().NEXT_PUBLIC_APP_URL,
  ).toString();
  const availableVouchers = vouchers.filter((voucher) =>
    voucher.status === "AVAILABLE" && voucher.expiresAt > now,
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-burgundy">Program ajak teman</p>
        <h1 className="mt-2 font-display text-4xl text-charcoal">Referral & voucher</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal/65">
          Bagikan tautan referral. Setelah teman baru menyelesaikan dan terverifikasi pembayaran pertamanya, Anda menerima voucher Rp20.000 untuk acara berikutnya.
        </p>
      </div>

      <Card>
        <ReferralShare code={referralCode} link={shareUrl} />
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Teman terdaftar", value: referrals.length },
          { label: "Hadiah terverifikasi", value: referrals.filter((item) => item.status === "REWARDED").length },
          { label: "Voucher tersedia", value: availableVouchers },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-sm text-charcoal/55">{item.label}</p>
            <p className="mt-2 font-display text-3xl text-charcoal">{item.value.toLocaleString("id-ID")}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-4">
        <div>
          <h2 className="font-display text-2xl text-charcoal">Aktivitas referral</h2>
          <p className="mt-1 text-sm text-charcoal/55">Hadiah hanya diberikan sekali setelah pembayaran pertama teman diverifikasi.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-charcoal/10 text-left text-sm">
            <thead className="bg-[#f8f6f2] text-xs uppercase tracking-wide text-charcoal/55">
              <tr>
                <th className="px-4 py-3">Pengguna baru</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Status hadiah</th>
                <th className="px-4 py-3">Voucher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/10">
              {referrals.length ? referrals.map((referral) => (
                <tr key={referral.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-charcoal">{referral.referred.name ?? "Tanpa nama"}</p>
                    <p className="mt-1 text-xs text-charcoal/55">{referral.referred.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-charcoal/65">{formatDate(referral.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={referral.status === "REWARDED"
                      ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                      : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"}>
                      {referral.status === "REWARDED" ? "Diberi hadiah" : "Menunggu pembayaran"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-charcoal/65">
                    {referral.voucher
                      ? `${formatCurrency(referral.voucher.amount.toString())} · ${referral.voucher.status === "USED" ? "Digunakan" : referral.voucher.status === "EXPIRED" ? "Kedaluwarsa" : referral.voucher.status === "RESERVED" ? "Menunggu pembayaran" : "Tersedia"}`
                      : "Belum diterbitkan"}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-charcoal/50">Belum ada teman yang mendaftar melalui tautan referral Anda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display text-2xl text-charcoal">Voucher referral</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {vouchers.length ? vouchers.map((voucher) => {
            const expired = voucher.status === "EXPIRED" || (voucher.status === "AVAILABLE" && voucher.expiresAt <= now);
            const status = expired ? "Kedaluwarsa" : voucher.status === "USED" ? "Digunakan" : voucher.status === "RESERVED" ? "Menunggu pembayaran" : "Tersedia";
            return (
              <article key={voucher.id} className="rounded-xl border border-charcoal/10 bg-[#fbf9f6] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-charcoal">{formatCurrency(voucher.amount.toString())}</p>
                    <p className="mt-1 text-xs text-charcoal/55">
                      Dari referral {voucher.referral.referred.name ?? voucher.referral.referred.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-charcoal/65">{status}</span>
                </div>
                <p className="mt-3 text-xs text-charcoal/55">Berlaku hingga {formatDate(voucher.expiresAt)}</p>
              </article>
            );
          }) : <p className="rounded-xl bg-[#fbf9f6] px-4 py-8 text-center text-sm text-charcoal/50 sm:col-span-2">Voucher akan muncul setelah pembayaran referral berhasil diverifikasi.</p>}
        </div>
      </Card>
    </div>
  );
}