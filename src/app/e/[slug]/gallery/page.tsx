import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";
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
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      name: true,
      privacyMode: true,
      status: true,
      expiresAt: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
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
          memory: { select: { caption: true } },
        },
      },
    },
  });
  const guestAccessEvent = event ? { ...event, isPaid: event.orders.length > 0 } : null;
  if (!event || !guestAccessEvent || !canViewEventGallery(guestAccessEvent)) notFound();
  if (
    (event.status === "EXPIRED" || (event.expiresAt && event.expiresAt <= now)) &&
    event.mediaAssets.length === 0
  ) {
    notFound();
  }

  return (
    <div className="min-h-full flex-1 bg-cream">
      <header className="border-b border-charcoal/10 px-4 py-4"><BrandLogo /></header>
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <PageHeader eyebrow="Collected together" title={event.name} description="A gallery of the moments guests have shared." />
          {event.mediaAssets.length > 0 && canAcceptGuestContributions(guestAccessEvent) ? (
            <Link href={`/e/${encodeURIComponent(slug)}#capture-options`} className={cn(buttonVariants())}>Capture a Memory</Link>
          ) : null}
        </div>
        {event.mediaAssets.length ? (
          <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
            {event.mediaAssets.map((asset) => (
              <figure key={asset.id} className="mb-4 break-inside-avoid bg-white">
                {asset.type === "VIDEO" ? (
                  <video
                    src={`/api/events/${encodeURIComponent(slug)}/media/${encodeURIComponent(asset.id)}`}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={asset.memory?.caption || asset.caption || `A shared video from ${event.name}`}
                    className="h-auto w-full bg-charcoal/5"
                  />
                ) : (
                  <Image
                    src={`/api/events/${encodeURIComponent(slug)}/media/${encodeURIComponent(asset.id)}`}
                    alt={asset.memory?.caption || asset.caption || `A shared memory from ${event.name}`}
                    width={1200}
                    height={900}
                    unoptimized
                    className="h-auto w-full"
                  />
                )}
                {asset.memory?.caption || asset.caption ? (
                  <figcaption className="px-4 py-3 font-display text-lg text-charcoal">
                    {asset.memory?.caption ?? asset.caption}
                    <time className="mt-1 block font-sans text-xs text-charcoal/50" dateTime={asset.createdAt.toISOString()}>
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(asset.createdAt)}
                    </time>
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : (
          <div className="mt-10 border-y border-charcoal/10 py-16 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-burgundy">The collection is beginning</p>
            <h2 className="mt-3 font-display text-3xl">No shared memories yet.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-charcoal/65">Approved memories will appear here as they are shared.</p>
            {canAcceptGuestContributions(guestAccessEvent) ? (
              <Link href={`/e/${encodeURIComponent(slug)}#capture-options`} className={cn(buttonVariants(), "mt-6")}>Add the first memory</Link>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}