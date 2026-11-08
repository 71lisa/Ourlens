import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";
import { FreeTrialForm } from "@/features/promotions/free-trial-form";

export default async function FreeTrialPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ORGANIZER") redirect("/login");

  const trial = await prisma.freeTrial.findUnique({
    where: { userId: session.user.id },
    select: {
      photoLimit: true,
      event: { select: { name: true, slug: true } },
    },
  });
  const photoCount = trial
    ? await prisma.mediaAsset.count({
        where: {
          event: { slug: trial.event.slug },
          type: "PHOTO",
          uploadStatus: "COMPLETE",
        },
      })
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-burgundy">Coba OurLens</p>
        <h1 className="mt-2 font-display text-4xl text-charcoal">Uji coba gratis</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal/65">
          Buat satu acara demo tanpa pembayaran. Unggah foto dan keterangan, lalu lihat hasilnya di galeri.
        </p>
      </div>

      <Card className="space-y-4 border-amber-200 bg-amber-50/70">
        <h2 className="font-display text-2xl text-charcoal">Batas penggunaan</h2>
        <ul className="list-inside list-disc space-y-1 text-sm leading-6 text-charcoal/70">
          <li>Satu acara uji coba gratis untuk setiap akun penyelenggara.</li>
          <li>Maksimal 10 foto; foto dan keterangannya dapat dicoba di galeri demo.</li>
          <li>Tidak perlu pembayaran dan tidak berubah otomatis menjadi paket berbayar.</li>
        </ul>
      </Card>

      {trial ? (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Uji coba aktif</p>
              <h2 className="mt-1 font-display text-2xl text-charcoal">{trial.event.name}</h2>
              <p className="mt-2 text-sm text-charcoal/60">
                {photoCount} dari {trial.photoLimit} foto digunakan · {Math.max(0, trial.photoLimit - photoCount)} foto tersisa
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Tidak kedaluwarsa otomatis
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/e/${encodeURIComponent(trial.event.slug)}`} className={cn(buttonVariants())}>
              Buka acara demo
            </Link>
            <Link
              href={`/e/${encodeURIComponent(trial.event.slug)}/gallery`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Lihat galeri
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="space-y-5">
          <div>
            <h2 className="font-display text-2xl text-charcoal">Siapkan acara demo</h2>
            <p className="mt-2 text-sm leading-6 text-charcoal/65">
              Acara percobaan akan langsung tersedia dan tidak membuat transaksi atau tagihan.
            </p>
          </div>
          <FreeTrialForm />
        </Card>
      )}
    </div>
  );
}