import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  BadgePercent,
  Check,
  CreditCard,
  Images,
  LayoutDashboard,
  QrCode,
  Sparkles,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitPartnerApplicationAction } from "@/features/partners/application-actions";
import { prisma } from "@/server/db/prisma";

const benefits = [
  {
    icon: BadgePercent,
    title: "Harga Khusus Mitra",
    description: "Nikmati diskon bertingkat berdasarkan jumlah pesanan yang berhasil dibayar dan diverifikasi.",
    tone: "bg-orange-100 text-orange-700",
  },
  {
    icon: Sparkles,
    title: "Paket Layanan Terpadu",
    description: "Jadikan pengalaman galeri foto digital sebagai bagian dari paket layanan WO atau EO Anda.",
    tone: "bg-rose/30 text-burgundy",
  },
  {
    icon: LayoutDashboard,
    title: "Dasbor Mitra",
    description: "Kelola pesanan klien dan akses informasi pembayaran, kode QR, serta galeri acara.",
    tone: "bg-burgundy/10 text-burgundy",
  },
  {
    icon: Images,
    title: "Galeri Terpisah untuk Setiap Acara",
    description: "Setiap acara memiliki kode QR dan galeri digital tersendiri untuk menghimpun foto tamu.",
    tone: "bg-amber-100 text-amber-800",
  },
];

const steps = [
  {
    icon: Users,
    title: "Ajukan Kemitraan",
    description: "Isi formulir pengajuan dan tunggu persetujuan dari admin OurLens.",
  },
  {
    icon: QrCode,
    title: "Buat Pesanan Acara",
    description: "Buat pesanan baru untuk acara klien melalui dasbor mitra.",
  },
  {
    icon: CreditCard,
    title: "Selesaikan Pembayaran",
    description: "Bayar layanan OurLens dengan harga khusus mitra yang tersedia.",
  },
  {
    icon: Images,
    title: "Bagikan Kode QR Acara",
    description: "Bagikan kode QR acara kepada klien atau tamu agar mereka dapat mengakses galeri.",
  },
];

const discountTiers = [
  { orders: "1–9 pesanan lunas", discount: "10%" },
  { orders: "10–19 pesanan lunas", discount: "12%" },
  { orders: "20–29 pesanan lunas", discount: "15%" },
  { orders: "30+ pesanan lunas", discount: "20%" },
];

const discountTerms = [
  "Diskon maksimal yang tersedia adalah 20%.",
  "Hanya pesanan yang berhasil dibayar dan diverifikasi yang dihitung. Pesanan yang menunggu pembayaran, gagal, kedaluwarsa, dibatalkan, atau dikembalikan tidak dihitung.",
  "Tingkat diskon yang sudah dicapai tidak akan turun.",
  "Tingkat diskon baru berlaku untuk pesanan berikutnya dan tidak berlaku surut.",
];

const messages: Record<string, string> = {
  invalid: "Periksa kembali semua data. Nomor telepon, deskripsi, dan alasan pengajuan harus valid.",
  pending: "Pengajuan Anda masih menunggu pemeriksaan admin.",
  blocked: "Pengajuan belum dapat dikirim ulang. Hubungi admin OurLens untuk membuka pengajuan kembali.",
  unavailable: "Pengajuan belum dapat disimpan. Silakan coba lagi.",
};

function applicationStatus(status: string) {
  if (status === "APPROVED") return "Disetujui";
  if (status === "REJECTED") return "Ditolak";
  return "Menunggu pemeriksaan";
}

export default async function PartnerApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role === "ADMIN") {
    redirect("/admin");
  }
  if (session?.user && !["ORGANIZER", "PARTNER"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const [partnerAccount, applications, params] = await Promise.all([
    session?.user
      ? prisma.partnerAccount.findUnique({ where: { userId: session.user.id } })
      : Promise.resolve(null),
    session?.user
      ? prisma.partnerApplication.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            businessName: true,
            status: true,
            adminNote: true,
            canReapply: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    searchParams,
  ]);
  if (partnerAccount?.status === "ACTIVE") redirect("/partner");
  const latest = applications[0];
  const canApply = session?.user?.role === "ORGANIZER" && (
    !latest ||
    latest.status === "APPROVED" ||
    latest.status === "REJECTED" && latest.canReapply
  );
  const applicationHref = session?.user
    ? "#application"
    : "/login?callbackUrl=%2Fpartner%2Fapply";

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-16 px-4 py-8 sm:px-6 lg:space-y-24 lg:py-12">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#f2e8da] px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        <div className="absolute -right-20 -top-24 -z-10 size-72 rounded-full bg-orange-300/35 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 -z-10 size-72 rounded-full bg-rose/45 blur-3xl" />
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-burgundy/10 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-burgundy">
              <Sparkles aria-hidden="true" className="size-4 text-orange-600" />
              Kemitraan OurLens
            </p>
            <h1 className="mt-6 max-w-2xl font-display text-5xl leading-[0.98] text-burgundy-deep sm:text-6xl lg:text-7xl">
              Kembangkan Bisnis Acara Anda bersama OurLens.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-charcoal/80 sm:text-lg">
              Jadikan pengalaman dokumentasi acara klien lebih interaktif dengan galeri digital yang mengumpulkan foto dari seluruh tamu dalam satu tempat.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#about"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-burgundy px-6 text-sm font-semibold text-white transition-colors hover:bg-burgundy-deep"
              >
                Pelajari Kemitraan
                <ArrowDown aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href={applicationHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-orange-700/25 bg-white/75 px-6 text-sm font-semibold text-orange-800 transition-colors hover:bg-white"
              >
                Ajukan Kemitraan
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>

          <div
            aria-label="Ilustrasi galeri OurLens: foto acara, QR Code, dan tamu yang berbagi momen"
            className="relative mx-auto w-full max-w-lg py-5"
          >
            <div className="absolute left-2 top-8 size-20 rounded-[1.75rem] bg-orange-300/70 sm:left-8" />
            <div className="absolute bottom-8 right-1 size-24 rounded-full bg-rose/70 sm:right-6" />
            <div className="relative mx-auto max-w-sm rotate-[-2deg] rounded-[2rem] border border-white/80 bg-white/90 p-3 shadow-[0_28px_70px_rgba(110,0,0,0.16)]">
              <div className="overflow-hidden rounded-[1.45rem] bg-burgundy-deep">
                <div className="flex items-center justify-between px-5 py-4 text-white">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-rose/80">Galeri acara</p>
                    <p className="mt-1 font-display text-2xl">Hari yang dikenang</p>
                  </div>
                  <QrCode aria-hidden="true" className="size-9 text-orange-300" />
                </div>
                <div className="grid grid-cols-2 gap-2 p-2 pt-0">
                  <div className="flex aspect-[1.15] items-end rounded-2xl bg-gradient-to-br from-orange-200 via-rose-200 to-orange-400 p-3">
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-burgundy-deep">Momen bersama</span>
                  </div>
                  <div className="flex aspect-[1.15] items-center justify-center rounded-2xl bg-gradient-to-br from-rose/40 via-rose to-burgundy">
                    <Users aria-hidden="true" className="size-12 text-white/90" />
                  </div>
                  <div className="col-span-2 flex items-center justify-between rounded-2xl bg-[#f8f2e9] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                        <Images aria-hidden="true" className="size-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-burgundy-deep">Satu galeri untuk semua</p>
                        <p className="mt-0.5 text-[10px] text-slate-600">Pindai, unggah, kenang kembali</p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="size-4 text-burgundy" />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-1 left-0 flex items-center gap-2 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-lg sm:left-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                <QrCode aria-hidden="true" className="size-5" />
              </div>
              <p className="text-xs font-semibold text-burgundy-deep">Satu kode QR untuk semua tamu</p>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <header className="max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">Kemitraan untuk acara</p>
            <h2 className="mt-3 font-display text-4xl leading-tight text-burgundy-deep sm:text-5xl">Tentang Kemitraan OurLens</h2>
          </header>
          <div className="space-y-5 text-base leading-7 text-slate-700">
            <p>
              Program Kemitraan OurLens ditujukan untuk penyelenggara pernikahan, penyelenggara acara, dan penyedia jasa acara. Mitra dapat menawarkan layanan OurLens sebagai bagian dari paket acara klien mereka.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Penyelenggara dapat memesan layanan OurLens untuk setiap acara klien.",
                "Setiap acara mendapatkan kode QR dan galeri digital tersendiri.",
                "Klien tidak perlu membuat akun OurLens sendiri.",
                "Mitra mengelola pesanan melalui dasbor kemitraan.",
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-burgundy/10 bg-white p-4">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-rose/30 text-burgundy">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                  <p className="text-sm leading-6 text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="benefits-heading">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">Alasan bermitra dengan kami</p>
          <h2 id="benefits-heading" className="mt-3 font-display text-4xl text-burgundy-deep sm:text-5xl">Manfaat Kemitraan</h2>
          <p className="mt-3 text-slate-600">Perangkat sederhana untuk membantu Anda menghadirkan pengalaman acara yang lebih berkesan.</p>
        </header>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {benefits.map(({ icon: Icon, title, description, tone }) => (
            <article key={title} className="rounded-3xl border border-burgundy/10 bg-white p-5 shadow-[0_12px_35px_rgba(110,0,0,0.05)]">
              <div className={`flex size-12 items-center justify-center rounded-2xl ${tone}`}>
                <Icon aria-hidden="true" className="size-6" />
              </div>
              <h3 className="mt-5 font-display text-2xl text-burgundy-deep">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-it-works-heading" className="rounded-[2rem] bg-burgundy-deep px-6 py-9 text-white sm:px-9 sm:py-12">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">Dari pengajuan hingga hari acara</p>
          <h2 id="how-it-works-heading" className="mt-3 font-display text-4xl sm:text-5xl">Cara Kerjanya</h2>
          <p className="mt-3 leading-6 text-rose/80">Alur kerja praktis, dari pengajuan mitra hingga kode QR siap dibagikan.</p>
        </header>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map(({ icon: Icon, title, description }, index) => (
            <li key={title} className="relative rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <div className="flex items-center justify-between">
                <span className="font-display text-3xl text-orange-300">0{index + 1}</span>
                <Icon aria-hidden="true" className="size-5 text-rose" />
              </div>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/75">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="discount-heading" className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">Apresiasi seiring perkembangan Anda</p>
          <h2 id="discount-heading" className="mt-3 font-display text-4xl leading-tight text-burgundy-deep sm:text-5xl">Diskon Mitra</h2>
          <p className="mt-4 leading-7 text-slate-600">
            Semakin banyak pesanan acara yang berhasil dibayar dan diverifikasi, semakin besar diskon untuk pesanan selanjutnya.
          </p>
          <ul className="mt-6 space-y-3">
            {discountTerms.map((term) => (
              <li key={term} className="flex gap-3 text-sm leading-6 text-slate-600">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-burgundy" />
                {term}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-3xl border border-burgundy/10 bg-white shadow-[0_12px_35px_rgba(110,0,0,0.05)]">
          <div className="flex items-center gap-3 bg-[#f2e8da] px-5 py-4 sm:px-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
              <BadgePercent aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-burgundy-deep">Diskon berdasarkan pesanan lunas</h3>
              <p className="text-xs text-slate-600">Harga khusus berlaku untuk pesanan berikutnya.</p>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-burgundy/10 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Pesanan lunas terverifikasi</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Diskon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-burgundy/10">
              {discountTiers.map((tier) => (
                <tr key={tier.orders}>
                  <th scope="row" className="px-5 py-4 font-medium text-slate-700 sm:px-6">{tier.orders}</th>
                  <td className="px-5 py-4 text-right font-semibold text-burgundy sm:px-6">{tier.discount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-burgundy/10 px-5 py-3 text-xs text-slate-500 sm:px-6">
            Tingkat diskon mengikuti jumlah pesanan terverifikasi yang tercatat pada akun mitra.
          </p>
        </div>
      </section>

      <section id="application" className="scroll-mt-8 rounded-[2rem] bg-[#f2e8da] p-5 sm:p-8 lg:p-10">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">Ambil langkah berikutnya</p>
          <h2 className="mt-3 font-display text-4xl text-burgundy-deep sm:text-5xl">Jadilah Mitra OurLens</h2>
          <p className="mt-3 text-slate-700">Lengkapi informasi bisnis Anda untuk mengajukan kerja sama dengan OurLens.</p>
        </header>

        <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-white/80 bg-white p-5 shadow-[0_20px_55px_rgba(110,0,0,0.08)] sm:p-8">
          {params.submitted ? <p role="status" className="mb-6 rounded-2xl bg-green-50 p-4 text-sm text-green-900">Pengajuan berhasil dikirim dan sedang menunggu pemeriksaan admin.</p> : null}
          {params.error && messages[params.error] ? <p role="alert" className="mb-6 rounded-2xl bg-rose/30 p-4 text-sm text-burgundy">{messages[params.error]}</p> : null}

          {applications.length ? (
            <section className="mb-8 space-y-3">
              <h3 className="font-display text-2xl text-burgundy-deep">Riwayat pengajuan</h3>
              <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
                {applications.map((application) => (
                  <article key={application.id} className="space-y-1 py-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>{application.businessName}</strong>
                      <span className="text-sm text-charcoal/65">{applicationStatus(application.status)}</span>
                    </div>
                    <p className="text-xs text-charcoal/55">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(application.createdAt)}</p>
                    {application.adminNote ? <p className="text-sm text-charcoal/70">Catatan admin: {application.adminNote}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!session?.user ? (
            <div className="space-y-4 rounded-2xl border border-burgundy/10 bg-rose/15 p-5">
              <p className="text-sm leading-6 text-burgundy-deep">
                Untuk mengajukan kemitraan, silakan masuk atau buat akun penyelenggara terlebih dahulu.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login?callbackUrl=%2Fpartner%2Fapply"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-burgundy px-5 text-sm font-semibold text-white hover:bg-burgundy-deep"
                >
                  Masuk untuk mengajukan
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-burgundy/20 px-5 text-sm font-semibold text-burgundy hover:bg-burgundy/5"
                >
                  Buat akun
                </Link>
              </div>
            </div>
          ) : session.user.role === "PARTNER" ? (
            <p className="rounded-2xl border border-charcoal/10 p-4 text-sm">
              {partnerAccount?.status === "SUSPENDED"
                ? "Akses mitra sedang ditangguhkan. Hubungi administrator OurLens untuk informasi lebih lanjut."
                : "Akun mitra belum aktif. Hubungi administrator OurLens untuk memeriksa status pengajuan."}
            </p>
          ) : latest?.status === "PENDING" ? (
            <p className="rounded-2xl border border-burgundy/10 bg-rose/15 p-4 text-sm text-burgundy-deep">Pengajuan Anda sedang ditinjau. Anda akan dapat membuka dasbor mitra setelah disetujui.</p>
          ) : canApply ? (
            <form action={submitPartnerApplicationAction} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="businessName" label="Nama bisnis / EO" required maxLength={160} />
                <Input name="businessType" label="Jenis usaha" required maxLength={100} placeholder="Penyelenggara acara, perencana pernikahan, ..." />
                <Input name="contactName" label="Nama kontak" required maxLength={120} />
                <Input name="contactPhone" label="Nomor telepon" required type="tel" maxLength={24} />
                <Input name="position" label="Jabatan" required maxLength={100} />
                <Input name="website" label="Situs web (opsional)" type="url" maxLength={300} />
                <Input name="city" label="Kota" required maxLength={100} />
                <Input name="province" label="Provinsi" required maxLength={100} />
                <Input name="eventsPerMonth" label="Perkiraan acara per bulan" type="number" min={0} max={1000} required />
                <Input name="typicalEventTypes" label="Jenis acara yang biasa ditangani" required maxLength={300} />
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Alamat usaha</span>
                  <textarea name="businessAddress" required minLength={5} maxLength={300} className="min-h-24 w-full rounded-xl border border-charcoal/15 bg-white p-3" />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Deskripsi usaha</span>
                  <textarea name="businessDescription" required minLength={20} maxLength={2000} className="min-h-28 w-full rounded-xl border border-charcoal/15 bg-white p-3" />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Alasan ingin menjadi mitra OurLens</span>
                  <textarea name="reason" required minLength={20} maxLength={2000} className="min-h-28 w-full rounded-xl border border-charcoal/15 bg-white p-3" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" className="rounded-full bg-burgundy hover:bg-burgundy-deep">Kirim pengajuan <ArrowRight aria-hidden="true" className="size-4" /></Button>
                <Link href="/dashboard" className="text-sm text-charcoal/70 hover:text-burgundy">Kembali ke dasbor penyelenggara</Link>
              </div>
            </form>
          ) : (
            <p className="rounded-2xl border border-charcoal/10 p-4 text-sm">Pengajuan sebelumnya belum dibuka untuk pengajuan ulang.</p>
          )}
        </div>
      </section>
    </main>
  );
}
