import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { eventGuestPath } from "@/lib/slug";
import { publicEnv } from "@/lib/env";
import { getQrService } from "@/services/qr";
import { prisma } from "@/server/db/prisma";
import { CopyEventLink } from "@/features/events/copy-event-link";
import { getEffectiveGuestEventStatus } from "@/server/authorization/policies";
import { formatZonedDateTimeInput, isValidTimeZone } from "@/lib/event-schedule";
import { EventScheduleForm } from "@/features/events/event-schedule-form";
import { PhotoExperienceSettings } from "@/features/events/photo-experience-settings";
import { getEventStatusLabel, getEventTypeLabel } from "@/lib/event-type";

function formatGb(bytes: bigint) {
  return `${(Number(bytes) / 1024 ** 3).toFixed(1)} GB`;
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, query, session] = await Promise.all([params, searchParams, auth()]);
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    redirect("/login");
  }

  const event = await prisma.event.findFirst({
    where: session.user.role === "ADMIN" ? { id } : { id, ownerId: session.user.id },
    include: {
      package: { select: { storageLimitBytes: true } },
      qrCode: { select: { destinationUrl: true } },
      storageUsage: { select: { quotaBytes: true, usedBytes: true } },
      _count: { select: { memories: true } },
      mediaAssets: {
        where: { type: { in: ["PHOTO", "VIDEO"] }, uploadStatus: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          caption: true,
          createdAt: true,
          memory: { select: { caption: true } },
        },
      },
      photoExperience: { select: { filter: true, frame: true } },
      orders: {
        select: {
          id: true,
          status: true,
          payments: { where: { provider: "MIDTRANS" }, select: { status: true }, take: 1 },
        },
        take: 1,
      },
    },
  });
  if (!event) notFound();

  const origin = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const eventUrl = event.qrCode?.destinationUrl ?? new URL(eventGuestPath(event.slug), origin).toString();
  const qrCode = await getQrService().generate({ destinationUrl: eventUrl, format: "png" });
  const photos = event.mediaAssets.filter((asset) => asset.type === "PHOTO").length;
  const videos = event.mediaAssets.filter((asset) => asset.type === "VIDEO").length;
  const photosToDisplay = event.mediaAssets.filter((asset) => asset.type === "PHOTO");
  const effectiveStatus = getEffectiveGuestEventStatus(event);
  const initialStart = event.startsAt && event.timeZone
    ? formatZonedDateTimeInput(event.startsAt, event.timeZone)
    : undefined;
  const initialEnd = event.endsAt && event.timeZone
    ? formatZonedDateTimeInput(event.endsAt, event.timeZone)
    : undefined;
  const usedBytes = event.storageUsage?.usedBytes ?? 0n;
  const quotaBytes = event.storageUsage?.quotaBytes ?? event.package?.storageLimitBytes ?? 0n;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {query.created === "1" ? (
        <div role="status" className="flex flex-col gap-3 border-l-2 border-burgundy bg-rose/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-xl">Pesanan acara Anda siap.</p>
          <Link href="/dashboard/events" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Kembali ke dasbor
          </Link>
        </div>
      ) : null}
      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end">
        <div className="space-y-4">
          <PageHeader
            eyebrow={`${getEventTypeLabel(event.eventType)} · ${getEventStatusLabel(effectiveStatus)}`}
            title={event.name}
            description={[
              event.startsAt && event.timeZone && isValidTimeZone(event.timeZone)
                ? new Intl.DateTimeFormat("id-ID", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: event.timeZone,
                  }).format(event.startsAt)
                : "Jadwal belum tersedia",
              event.location,
            ].filter(Boolean).join(" · ")}
          />
          {event.orders[0] && event.orders[0].status !== "PAID" ? (
            <div className="border-l-2 border-burgundy bg-rose/15 px-4 py-3">
              <p className="text-sm font-medium">Pembayaran {event.orders[0].status === "PENDING" ? "menunggu" : event.orders[0].status === "FAILED" ? "gagal" : event.orders[0].status === "CANCELLED" ? "dibatalkan" : event.orders[0].status === "EXPIRED" ? "kedaluwarsa" : "dikembalikan"}</p>
              <Link href={`/dashboard/transactions/${event.orders[0].id}`} className="mt-1 inline-block text-sm text-burgundy underline">
                Lihat pesanan dan lanjutkan pembayaran
              </Link>
              <p className="mt-1 text-xs text-charcoal/60">Akses tamu dan kontribusi belum aktif sampai pembayaran terverifikasi.</p>
            </div>
          ) : null}
          <Link href={`/e/${event.slug}`} className={cn(buttonVariants({ variant: "outline" }))}>
            Buka Halaman Tamu
          </Link>
          <Link href={`/e/${event.slug}/gallery`} className={cn(buttonVariants({ variant: "ghost" }))}>
            Lihat Galeri
          </Link>
        </div>
        <div
          className="aspect-[4/3] bg-cream-deep bg-cover bg-center"
          style={event.coverImageKey ? { backgroundImage: `url("${event.coverImageKey.replaceAll('"', '%22')}")` } : undefined}
          role="img"
          aria-label={event.coverImageKey ? `Sampul acara ${event.name}` : "Belum ada foto sampul acara"}
        />
      </section>

      <details className="border-y border-charcoal/10 py-4">
        <summary className="cursor-pointer font-display text-xl">Jadwal acara</summary>
        <p className="my-3 text-sm text-charcoal/65">
          Kontribusi dibuka pada waktu mulai dan ditutup pada waktu berakhir yang dijadwalkan. Pilih zona waktu setempat untuk acara ini.
        </p>
        <EventScheduleForm
          eventId={event.id}
          initialValue={{
            eventDate: initialStart?.date ?? event.eventDate?.toISOString().slice(0, 10) ?? "",
            startTime: initialStart?.time ?? "",
            endDate: initialEnd?.date ?? "",
            endTime: initialEnd?.time ?? "",
            timeZone: event.timeZone ?? "",
          }}
        />
      </details>

      <section className="grid gap-8 border-y border-charcoal/10 py-8 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Akses tamu</p>
          <h2 className="font-display text-2xl">Satu tautan untuk semua cerita.</h2>
          <p className="break-all text-sm text-charcoal/70">{eventUrl}</p>
          <div className="flex flex-wrap gap-3">
            <CopyEventLink url={eventUrl} />
            <a href={`/api/events/${event.slug}/qr`} className={cn(buttonVariants({ variant: "ghost" }))}>
              Unduh Kode QR
            </a>
          </div>
        </div>
        <Card className="flex flex-col items-center gap-3 border-charcoal/10 bg-white p-4">
          <Image
            src={`data:image/png;base64,${qrCode.toString("base64")}`}
            alt={`Kode QR untuk ${event.name}`}
            width={224}
            height={224}
            unoptimized
          />
          <p className="text-xs uppercase tracking-[0.15em] text-charcoal/55">Pindai untuk membuka acara</p>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Ringkasan koleksi</h2>
        <div className="grid gap-px border border-charcoal/10 bg-charcoal/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Momen", String(event._count.memories)],
            ["Foto", String(photos)],
            ["Video", String(videos)],
            ["Penyimpanan", `${formatGb(usedBytes)} terpakai · kuota ${formatGb(quotaBytes)}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-cream px-5 py-4">
              <p className="text-xs uppercase tracking-[0.15em] text-charcoal/55">{label}</p>
              <p className="mt-2 font-display text-xl text-burgundy">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <PhotoExperienceSettings
        eventId={event.id}
        eventName={event.name}
        eventDateLabel={event.eventDate
          ? new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(event.eventDate)
          : ""}
        initialFilter={event.photoExperience?.filter}
        initialFrame={event.photoExperience?.frame}
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Koleksi terbit</p>
            <h2 className="mt-2 font-display text-2xl">Foto tamu</h2>
          </div>
          <span className="text-sm text-charcoal/60">{photosToDisplay.length} foto</span>
        </div>
        {photosToDisplay.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photosToDisplay.map((asset) => (
              <figure key={asset.id} className="overflow-hidden border border-charcoal/10 bg-white">
                <Image
                  src={`/api/dashboard/events/${encodeURIComponent(event.id)}/media/${encodeURIComponent(asset.id)}`}
                  alt={asset.memory?.caption || asset.caption || `Foto yang dibagikan dari acara ${event.name}`}
                  width={1200}
                  height={900}
                  unoptimized
                  className="aspect-[4/3] w-full bg-cream-deep object-contain"
                />
                {asset.memory?.caption || asset.caption ? (
                  <figcaption className="px-3 py-2 text-sm text-charcoal/75">
                    {asset.memory?.caption ?? asset.caption}
                  </figcaption>
                ) : null}
                <time className="block px-3 pb-3 text-xs text-charcoal/50" dateTime={asset.createdAt.toISOString()}>
                  {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(asset.createdAt)}
                </time>
              </figure>
            ))}
          </div>
        ) : (
          <p className="border-y border-charcoal/10 py-8 text-sm text-charcoal/65">
            Foto tamu akan muncul di sini setelah diunggah.
          </p>
        )}
      </section>
    </div>
  );
}
