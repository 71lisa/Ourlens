import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";
import { canManageEvent } from "@/server/authorization/policies";
import { GuestGallery } from "@/features/memories/guest-gallery";
import { getEventTypeLabel } from "@/lib/event-type";
import { getPackageGuestCapacity } from "@/lib/photo-quota";
import { parsePackageSnapshot } from "@/server/packages/snapshot";
import {
  canAcceptGuestContributions,
  canViewEventGallery,
  PUBLIC_GALLERY_MODERATION_STATUSES,
} from "@/server/authorization/policies";

export default async function GuestGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const now = new Date();
  const [event, session] = await Promise.all([
    prisma.event.findUnique({
      where: { slug },
      select: {
        name: true,
        eventDate: true,
        eventType: true,
        location: true,
        coverImageKey: true,
        ownerId: true,
        accessGrants: { select: { userId: true, role: true } },
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
        customization: { select: { welcomeTitle: true } },
        _count: { select: { guestSessions: true } },
        mediaAssets: {
          where: {
            type: { in: ["PHOTO", "VIDEO"] },
            uploadStatus: "COMPLETE",
            moderationStatus: { in: [...PUBLIC_GALLERY_MODERATION_STATUSES] },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            caption: true,
            expiresAt: true,
            createdAt: true,
            memory: {
              select: {
                caption: true,
                guestSession: { select: { displayName: true } },
              },
            },
          },
        },
      },
    }),
    auth(),
  ]);
  const guestAccessEvent = event
    ? { ...event, isPaid: event.orders.length > 0, isTrial: Boolean(event.freeTrial) }
    : null;
  if (!event || !guestAccessEvent || !canViewEventGallery(guestAccessEvent)) notFound();
  if (
    (event.status === "EXPIRED" || (event.expiresAt && event.expiresAt <= now)) &&
    event.mediaAssets.length === 0
  ) {
    notFound();
  }
  const snapshotGuestCapacity = getPackageGuestCapacity(
    parsePackageSnapshot(event.orders[0]?.packageSnapshot),
  );
  const guestCapacity = event.freeTrial
    ? null
    : snapshotGuestCapacity === 0
      ? getPackageGuestCapacity(event.package)
      : snapshotGuestCapacity;
  const guestCountLabel = event.freeTrial
    ? String(event._count.guestSessions)
    : `${event._count.guestSessions}/${guestCapacity === null ? "∞" : guestCapacity}`;
  const eventDate = event.endsAt ?? event.eventDate;
  const formattedEventDate = eventDate
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(eventDate)
    : "—";
  const canDelete = session?.user && session.user.role !== "GUEST"
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
  const assets = event.mediaAssets.map((asset) => ({
    id: asset.id,
    type: asset.type as "PHOTO" | "VIDEO",
    caption: asset.memory?.caption?.trim() || asset.caption?.trim() || null,
    uploaderName: asset.memory?.guestSession?.displayName?.trim() || null,
    createdAt: asset.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-full flex-1 bg-cream">
      <header className="border-b border-charcoal/10 px-4 py-4"><BrandLogo /></header>
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
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
          </div>
          <dl className="mt-6 grid grid-cols-3 divide-x divide-charcoal/15 border-y border-charcoal/10 py-4 text-center sm:mt-7 sm:py-5">
            <div className="px-2">
              <dt className="font-display text-2xl italic text-charcoal sm:text-3xl">{event.mediaAssets.length}</dt>
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
        </section>
        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-burgundy">Galeri acara</p>
            <h2 className="mt-2 font-display text-2xl text-charcoal">Kumpulan Momen</h2>
            <p className="mt-1 text-sm text-charcoal/65">Galeri momen yang dibagikan oleh para tamu.</p>
          </div>
          {event.mediaAssets.length > 0 && canAcceptGuestContributions(guestAccessEvent) ? (
            <Link href={`/e/${encodeURIComponent(slug)}#capture-options`} className={cn(buttonVariants())}>Bagikan Momen</Link>
          ) : null}
        </div>
        {event.freeTrial ? (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Galeri acara uji coba gratis · batas maksimum 10 foto.
          </p>
        ) : null}
        {event.mediaAssets.length ? (
          <GuestGallery
            slug={slug}
            eventName={event.name}
            initialAssets={assets}
            canDelete={canDelete}
          />
        ) : (
          <div className="mt-10 border-y border-charcoal/10 py-16 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Awal dari sebuah kumpulan</p>
            <h2 className="mt-3 font-display text-3xl">Belum ada momen yang dibagikan.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-charcoal/65">Foto baru akan muncul di sini setelah diunggah.</p>
            {canAcceptGuestContributions(guestAccessEvent) ? (
              <Link href={`/e/${encodeURIComponent(slug)}#capture-options`} className={cn(buttonVariants(), "mt-6")}>Bagikan momen pertama</Link>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}