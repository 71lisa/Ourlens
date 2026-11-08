import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgePercent, Camera, Gift } from "lucide-react";
import { auth } from "@/auth";
import { Container } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { siteConfig } from "@/config/site";
import { prisma } from "@/server/db/prisma";

const beats = [
  {
    step: "Pindai",
    title: "Datang lewat kode QR",
    copy: "Tamu membuka tautan acara unik di ponsel. Tidak perlu menginstal aplikasi.",
  },
  {
    step: "Bagikan",
    title: "Semua orang menjadi pencerita",
    copy: "Foto, video, dan catatan terkumpul dalam satu galeri hidup saat malam berlangsung.",
  },
  {
    step: "Nikmati",
    title: "Kumpulkan momen yang terlewat",
    copy: "Fotografer resmi menangkap cerita utama. OurLens menangkap cerita semua orang.",
  },
];

export default async function HomePage() {
  const session = await auth();
  const isOrganizer = session?.user.role === "ORGANIZER";
  const primaryAction = session?.user.role === "ORGANIZER"
    ? { href: "/dashboard/events/create", label: "Buat Acara Anda" }
    : session?.user.role === "PARTNER"
      ? { href: "/partner/orders/new", label: "Buat Acara untuk Klien" }
      : session?.user.role === "ADMIN"
        ? { href: "/admin", label: "Buka Dasbor Admin" }
        : { href: "/register", label: "Buat Acara Anda" };
  const [promotionSettings, previousPaidOrder, freeTrial] = await Promise.all([
    prisma.promotionSettings.findUnique({
      where: { id: "global" },
      select: { firstEventActive: true, referralActive: true },
    }),
    isOrganizer
      ? prisma.order.findFirst({
          where: {
            userId: session.user.id,
            partnerAccountId: null,
            status: "PAID",
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    isOrganizer
      ? prisma.freeTrial.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  const canSeeBuyerPromotions = !session?.user || isOrganizer;
  const promotions = canSeeBuyerPromotions
    ? [
        ...(
          promotionSettings?.firstEventActive &&
          (!session?.user || (isOrganizer && !previousPaidOrder))
            ? [{
                title: "Diskon Acara Pertama – Hemat 15%!",
                description: "Penawaran khusus pengguna baru: hemat 15% untuk pembelian acara pertama Anda.",
                detail: "Berlaku otomatis bagi penyelenggara yang belum pernah menyelesaikan pembelian.",
                label: "Buat acara pertama",
                href: isOrganizer ? "/dashboard/events/create" : "/register",
                icon: BadgePercent,
                style: "border-burgundy/20 bg-[#fff7f4]",
                iconStyle: "bg-burgundy text-white",
              }]
            : []
        ),
        {
          title: "Coba OurLens Gratis!",
          description: "Coba satu acara demo tanpa pembayaran, dengan kapasitas maksimal 10 foto.",
          detail: "Unggah foto dan keterangan, lalu lihat hasilnya di galeri. Tidak ada tagihan otomatis.",
          label: freeTrial ? "Lanjutkan uji coba gratis" : "Mulai uji coba gratis",
          href: isOrganizer ? "/dashboard/trial" : "/register",
          icon: Camera,
          style: "border-charcoal/10 bg-[#f7f5f1]",
          iconStyle: "bg-charcoal text-white",
        },
        ...(
          promotionSettings?.referralActive
            ? [{
                title: "Ajak Teman, Dapatkan Rp20.000!",
                description: "Dapatkan voucher Rp20.000 saat teman yang Anda ajak berhasil membayar pesanan pertamanya.",
                detail: "Hadiah diberikan setelah pembayaran terverifikasi · voucher berlaku 6 bulan.",
                label: "Bagikan kode referral",
                href: isOrganizer ? "/dashboard/referrals" : "/register",
                icon: Gift,
                style: "border-amber-200 bg-amber-50/70",
                iconStyle: "bg-amber-700 text-white",
              }]
            : []
        ),
      ]
    : [];

  return (
    <>
      <section className="border-b border-charcoal/10 bg-cream-deep/40">
        <Container className="grid gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.32em] text-burgundy">Platform kenangan acara</p>
            <h1 className="font-display text-5xl leading-[1.05] text-charcoal sm:text-6xl lg:text-7xl">
              Satu Acara.
              <br />
              Ratusan Perspektif.
            </h1>
            <p className="max-w-xl text-lg text-charcoal/75">{siteConfig.description}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={primaryAction.href} className={cn(buttonVariants({ size: "lg" }))}>
                {primaryAction.label}
              </Link>
              <Link
                href="/how-it-works"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Lihat Cara Kerjanya
              </Link>
            </div>
          </div>
          <div className="grid aspect-[4/5] grid-cols-[1.15fr_0.85fr] gap-3">
            <figure className="group relative overflow-hidden rounded-2xl bg-cream-deep">
              <Image
                src="/images/landing-wedding-lift.jpg"
                alt="Pasangan pengantin diangkat para tamu saat perayaan."
                fill
                priority
                sizes="(min-width: 1024px) 25vw, 60vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/75 via-transparent to-charcoal/10" />
              <figcaption className="absolute inset-x-5 bottom-5 text-cream sm:inset-x-6 sm:bottom-6">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-beige">
                  Galeri bersama
                </p>
                <p className="mt-2 font-display text-2xl leading-tight sm:text-3xl">
                  Cerita dari semua sudut.
                </p>
              </figcaption>
            </figure>
            <div className="grid min-h-0 grid-rows-2 gap-3">
              <figure className="group relative overflow-hidden rounded-2xl bg-cream-deep">
                <Image
                  src="/images/landing-toast.jpg"
                  alt="Para tamu bersulang bersama di meja makan."
                  fill
                  sizes="(min-width: 1024px) 18vw, 40vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </figure>
              <figure className="group relative overflow-hidden rounded-2xl bg-cream-deep">
                <Image
                  src="/images/landing-dance.jpg"
                  alt="Para tamu menari di pesta dengan lampu disko."
                  fill
                  sizes="(min-width: 1024px) 18vw, 40vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </figure>
            </div>
          </div>
        </Container>
      </section>

      {promotions.length ? (
        <section className="relative overflow-hidden border-b border-charcoal/10 bg-white py-14 sm:py-18 lg:py-20">
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-burgundy">
                Lebih banyak alasan untuk mulai
              </p>
              <h2 className="mt-3 font-display text-4xl text-charcoal sm:text-5xl">
                Momen spesial, penawaran spesial.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-charcoal/65 sm:text-base">
                Nikmati promo OurLens untuk mencoba, membuat event pertama, atau mengajak teman.
              </p>
            </div>
            <div className="mt-9 grid gap-4 lg:grid-cols-3">
              {promotions.map((promotion) => {
                const Icon = promotion.icon;
                return (
                  <article
                    key={promotion.title}
                    className={`flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6 ${promotion.style}`}
                  >
                    <div className={`grid size-11 place-items-center rounded-xl ${promotion.iconStyle}`}>
                      <Icon aria-hidden="true" className="size-5" />
                    </div>
                    <h3 className="mt-5 font-display text-2xl leading-tight text-charcoal">
                      {promotion.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-charcoal/75">
                      {promotion.description}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-charcoal/55">
                      {promotion.detail}
                    </p>
                    <Link
                      href={promotion.href}
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "mt-6 w-full justify-between border-charcoal/20 text-charcoal hover:border-burgundy hover:text-burgundy sm:mt-auto",
                      )}
                    >
                      {promotion.label}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}

      <section className="py-16 lg:py-24">
        <Container>
          <div className="grid gap-10 md:grid-cols-3">
            {beats.map((beat) => (
              <article key={beat.step} className="border-t border-burgundy/40 pt-6">
                <p className="text-xs uppercase tracking-[0.28em] text-burgundy">{beat.step}</p>
                <h2 className="mt-3 font-display text-3xl">{beat.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-charcoal/70">{beat.copy}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
