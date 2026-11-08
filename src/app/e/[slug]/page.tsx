import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/server/db/prisma";
import { cn } from "@/lib/cn";
import Image from "next/image";
import Link from "next/link";
import { GuestGallery } from "@/features/memories/guest-gallery";
import { GuestCapture } from "@/features/memories/guest-capture";
import { DEFAULT_PHOTO_EXPERIENCE } from "@/features/memories/media-studio-config";
import {
  canAcceptGuestContributions,
  canAccessGuestEventPage,
  canManageEvent,
  canViewEventGallery,
  getEffectiveGuestEventStatus,
  PUBLIC_GALLERY_MODERATION_STATUSES,
} from "@/server/authorization/policies";
import { getPackageGuestCapacity } from "@/lib/photo-quota";
import { parsePackageSnapshot } from "@/server/packages/snapshot";
import { getEventTypeLabel } from "@/lib/event-type";

export default async function GuestEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const now = new Date();
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      ownerId: true,
      accessGrants: { select: { userId: true, role: true } },
      name: true,
      eventDate: true,
      description: true,
      location: true,
      eventType: true,
      coverImageKey: true,
      privacyMode: true,
      status: true,
      expiresAt: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      orders: {
        where: { status: "PAID" },
        select: { id: true, packageSnapshot: true },
        take: 1,
      },
      package: { select: { name: true, guestCapacity: true, isUnlimited: true } },
      freeTrial: { select: { photoLimit: true } },
      mediaAssets: {
        where: {
          type: { in: ["PHOTO", "VIDEO"] },
          uploadStatus: "COMPLETE",
          moderationStatus: { in: [...PUBLIC_GALLERY_MODERATION_STATUSES] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: "desc" },
        take: 9,
        select: {
          id: true,
          type: true,
          caption: true,
          createdAt: true,
          memory: {
            select: {
              caption: true,
              guestSession: { select: { displayName: true } },
            },
          },
        },
      },
      _count: { select: { guestSessions: true } },
      challenges: {
        where: { active: true },
        select: { id: true, title: true },
        orderBy: { createdAt: "asc" },
      },
      customization: { select: { welcomeTitle: true, welcomeMessage: true, accentColor: true } },
      photoExperience: { select: { filter: true, frame: true } },
    },
  });
  const guestAccessEvent = event
    ? { ...event, isPaid: event.orders.length > 0, isTrial: Boolean(event.freeTrial) }
    : null;
  if (!event || !guestAccessEvent || !canAccessGuestEventPage(guestAccessEvent)) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-cream">
        <header className="border-b border-charcoal/10 px-4 py-4"><BrandLogo /></header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-burgundy">Acara OurLens</p>
          <h1 className="mt-3 font-display text-4xl">Acara tidak ditemukan</h1>
          <p className="mt-3 text-charcoal/70">Tautan acara ini mungkin sudah kedaluwarsa atau tidak tersedia untuk tamu.</p>
        </main>
      </div>
    );
  }

  const [momentCount, trialPhotoCount, session] = await Promise.all([
    canViewEventGallery(guestAccessEvent)
      ? prisma.mediaAsset.count({
          where: {
            eventId: event.id,
            type: { in: ["PHOTO", "VIDEO"] },
            uploadStatus: "COMPLETE",
            moderationStatus: { in: [...PUBLIC_GALLERY_MODERATION_STATUSES] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        })
      : Promise.resolve(0),
    event.freeTrial
      ? prisma.mediaAsset.count({
          where: { eventId: event.id, type: "PHOTO", uploadStatus: "COMPLETE" },
        })
      : Promise.resolve(0),
    auth(),
  ]);
  const acceptsContributions = canAcceptGuestContributions(guestAccessEvent, now);
  const effectiveStatus = getEffectiveGuestEventStatus(guestAccessEvent, now);
  const snapshotGuestCapacity = getPackageGuestCapacity(
    parsePackageSnapshot(event.orders[0]?.packageSnapshot),
  );
  const guestCapacity = event.freeTrial
    ? null
    : snapshotGuestCapacity === 0
      ? getPackageGuestCapacity(event.package)
      : snapshotGuestCapacity;
  const guestCountLabel = event.freeTrial
    ? String(event._count?.guestSessions ?? 0)
    : `${event._count?.guestSessions ?? 0}/${guestCapacity === null ? "∞" : guestCapacity}`;
  const eventDate = event.endsAt ?? event.eventDate;
  const formattedEventDate = eventDate
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(eventDate)
    : "—";
  const openingTime = effectiveStatus === "UPCOMING" && event.startsAt && event.timeZone
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: event.timeZone,
      }).format(event.startsAt)
    : null;
  const canDeleteMedia = session?.user && session.user.role !== "GUEST"
    ? canManageEvent(
        { id: session.user.id, role: session.user.role },
        {
          ownerId: event.ownerId,
          privacyMode: event.privacyMode,
          grantUserIds: event.accessGrants
            .filter((grant) => grant.role !== "VIEWER")
            .map((grant) => grant.userId),
        },
      )
    : false;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream text-charcoal">
      <header className="border-b border-charcoal/10 px-4 py-4">
        <BrandLogo />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 pb-16 sm:px-6 sm:py-12 lg:px-8">
        {event.coverImageKey ? (
          <div className="relative mx-auto mb-8 aspect-[16/9] max-w-3xl overflow-hidden rounded-xl bg-cream-deep">
            <Image
              src={event.coverImageKey}
              alt={`Sampul acara ${event.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              unoptimized
              className="object-cover"
            />
          </div>
        ) : null}
        <section className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-burgundy">
              {getEventTypeLabel(event.eventType)}{event.location ? ` · ${event.location}` : ""}
            </p>
            <h1 className="mt-3 font-display text-3xl text-charcoal sm:text-4xl">
              {event.customization?.welcomeTitle || event.name}
            </h1>
            {event.customization?.welcomeMessage || event.description ? (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-charcoal/65">
                {event.customization?.welcomeMessage || event.description}
              </p>
            ) : null}
          </div>
          <dl className="mt-6 grid grid-cols-3 divide-x divide-charcoal/15 border-y border-charcoal/10 py-4 text-center sm:mt-7 sm:py-5">
            <div className="px-2">
              <dt className="font-display text-2xl italic text-charcoal sm:text-3xl">{momentCount}</dt>
              <dd className="mt-1 text-[0.65rem] text-charcoal/60 sm:text-xs">Momen</dd>
            </div>
            <div className="px-2">
              <dt className="font-display text-2xl italic text-charcoal sm:text-3xl">{formattedEventDate}</dt>
              <dd className="mt-1 text-[0.65rem] text-charcoal/60 sm:text-xs">
                {event.endsAt ? "Berakhir" : "Tanggal"}
              </dd>
            </div>
            <div className="px-2">
              <dt className="font-display text-2xl italic text-charcoal sm:text-3xl">{guestCountLabel}</dt>
              <dd className="mt-1 text-[0.65rem] text-charcoal/60 sm:text-xs">Orang</dd>
            </div>
          </dl>
          {event.freeTrial ? (
            <p className="mt-4 rounded-xl border border-amber-200/20 bg-amber-50/10 px-4 py-3 text-sm text-amber-100">
              Acara demo uji coba gratis · {trialPhotoCount} dari {event.freeTrial.photoLimit} foto telah digunakan.
            </p>
          ) : null}
          <div className="mt-8 border-y border-charcoal/10 py-6">
            <p className="font-display text-2xl">Kumpulan momen hari ini.</p>
            <p className="mt-2 text-sm text-charcoal/70">Setiap tamu punya cerita berbeda dari perayaan ini.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {acceptsContributions ? (
                <a href="#capture-options" className={cn(buttonVariants({ size: "lg" }))}>Bagikan Momen</a>
              ) : (
                <p className="self-center text-sm text-charcoal/65">
              {openingTime
                ? `Kontribusi foto dibuka ${openingTime} (${event.timeZone}).`
                : effectiveStatus === "SCHEDULE_UNAVAILABLE"
                  ? "Waktu acara belum tersedia, jadi unggahan foto dijeda."
                  : "Acara ini sudah ditutup untuk unggahan foto."}
                </p>
              )}
              {canViewEventGallery(guestAccessEvent) ? (
                <Link
                  href={`/e/${encodeURIComponent(slug)}/gallery`}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  Lihat Galeri
                </Link>
              ) : null}
            </div>
          </div>
          {acceptsContributions ? (
            <div id="capture" className="mt-8 scroll-mt-8">
              <GuestCapture
                slug={slug}
                eventName={event.name}
                eventDateLabel={event.eventDate
                  ? new Intl.DateTimeFormat("id-ID", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(event.eventDate)
                  : ""}
                filter={event.photoExperience?.filter ?? DEFAULT_PHOTO_EXPERIENCE.filter}
                frame={event.photoExperience?.frame ?? DEFAULT_PHOTO_EXPERIENCE.frame}
                galleryAvailable={canViewEventGallery(guestAccessEvent)}
                challengePrompts={event.challenges}
              />
            </div>
          ) : null}
        </section>
        {canViewEventGallery(guestAccessEvent) ? (
          <section className="mx-auto mt-9 max-w-6xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-burgundy">Galeri acara</p>
                <h2 className="mt-2 font-display text-2xl text-charcoal">Momen yang terkumpul</h2>
              </div>
              {momentCount > 0 ? (
                <Link
                  href={`/e/${encodeURIComponent(slug)}/gallery`}
                  className="shrink-0 text-sm text-burgundy underline underline-offset-4"
                >
                  Lihat semua
                </Link>
              ) : null}
            </div>
            {event.mediaAssets.length > 0 ? (
              <GuestGallery
                slug={slug}
                eventName={event.name}
                initialAssets={event.mediaAssets.map((asset) => ({
                  id: asset.id,
                  type: asset.type as "PHOTO" | "VIDEO",
                  caption: asset.memory?.caption?.trim() || asset.caption?.trim() || null,
                  uploaderName: asset.memory?.guestSession?.displayName?.trim() || null,
                  createdAt: asset.createdAt.toISOString(),
                }))}
                canDelete={canDeleteMedia}
              />
            ) : (
              <p className="mt-4 text-sm text-charcoal/60">Belum ada momen yang dibagikan.</p>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
