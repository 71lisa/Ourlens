import { BrandLogo } from "@/components/layout/brand-logo";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/server/db/prisma";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { GuestCapture } from "@/features/memories/guest-capture";
import {
  canAcceptGuestContributions,
  canAccessGuestEventPage,
  canViewEventGallery,
  getEffectiveGuestEventStatus,
} from "@/server/authorization/policies";

export default async function GuestEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
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
      orders: { where: { status: "PAID" }, select: { id: true }, take: 1 },
      challenges: {
        where: { active: true },
        select: { id: true, title: true },
        orderBy: { createdAt: "asc" },
      },
      customization: { select: { welcomeTitle: true, welcomeMessage: true, accentColor: true } },
    },
  });
  const guestAccessEvent = event ? { ...event, isPaid: event.orders.length > 0 } : null;
  const now = new Date();
  if (!event || !guestAccessEvent || !canAccessGuestEventPage(guestAccessEvent)) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-cream">
        <header className="border-b border-charcoal/10 px-4 py-4"><BrandLogo /></header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-burgundy">OurLens event</p>
          <h1 className="mt-3 font-display text-4xl">Event not found</h1>
          <p className="mt-3 text-charcoal/70">This event link may have expired or isn’t available to guests.</p>
        </main>
      </div>
    );
  }

  const acceptsContributions = canAcceptGuestContributions(guestAccessEvent, now);
  const effectiveStatus = getEffectiveGuestEventStatus(event, now);
  const openingTime = effectiveStatus === "UPCOMING" && event.startsAt && event.timeZone
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: event.timeZone,
      }).format(event.startsAt)
    : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-cream">
      <header className="border-b border-charcoal/10 px-4 py-4">
        <BrandLogo />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12">
        {event.coverImageKey ? (
          <div
            className="mb-8 aspect-[16/9] bg-cream-deep bg-cover bg-center"
            style={{ backgroundImage: `url("${event.coverImageKey.replaceAll('"', '%22')}")` }}
            role="img"
            aria-label={`Cover for ${event.name}`}
          />
        ) : null}
        <PageHeader
          eyebrow={`${event.eventType}${event.location ? ` · ${event.location}` : ""}`}
          title={event.customization?.welcomeTitle || event.name}
          description={[
            event.eventDate && new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(event.eventDate),
            event.customization?.welcomeMessage || event.description,
          ].filter(Boolean).join(" · ")}
        />
        <div className="mt-10 border-t border-charcoal/10 pt-6" style={event.customization?.accentColor ? { borderColor: event.customization.accentColor } : undefined}>
          <p className="font-display text-2xl">A shared collection of the day.</p>
          <p className="mt-2 text-sm text-charcoal/70">Every guest has a different view of this celebration.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            {acceptsContributions ? (
              <a href="#capture-options" className={cn(buttonVariants({ size: "lg" }))}>Capture a Memory</a>
            ) : (
              <p className="self-center text-sm text-charcoal/65">
                {openingTime
                  ? `Contributions open on ${openingTime} (${event.timeZone}).`
                  : effectiveStatus === "SCHEDULE_UNAVAILABLE"
                    ? "Event timing is unavailable, so new contributions are paused."
                    : "This event is closed to new memories."}
              </p>
            )}
            {canViewEventGallery(guestAccessEvent) ? (
              <Link href={`/e/${encodeURIComponent(slug)}/gallery`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>View Gallery</Link>
            ) : null}
          </div>
        </div>
        {acceptsContributions ? (
          <div id="capture" className="mt-8 scroll-mt-8"><GuestCapture slug={slug} challengePrompts={event.challenges} /></div>
        ) : null}
      </main>
    </div>
  );
}
