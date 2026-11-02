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
      mediaAssets: { select: { type: true, moderationStatus: true } },
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
  const pendingCount = event.mediaAssets.filter((asset) => asset.moderationStatus === "PENDING").length;
  const approvedCount = event.mediaAssets.filter((asset) => asset.moderationStatus === "APPROVED").length;
  const rejectedCount = event.mediaAssets.filter((asset) => asset.moderationStatus === "REJECTED").length;
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
          <p className="font-display text-xl">Your event order is ready.</p>
          <Link href="/dashboard/events" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Go to Dashboard
          </Link>
        </div>
      ) : null}
      <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end">
        <div className="space-y-4">
          <PageHeader
            eyebrow={`${event.eventType} · ${effectiveStatus}`}
            title={event.name}
            description={[
              event.startsAt && event.timeZone && isValidTimeZone(event.timeZone)
                ? new Intl.DateTimeFormat("en", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: event.timeZone,
                  }).format(event.startsAt)
                : "Schedule unavailable",
              event.location,
            ].filter(Boolean).join(" · ")}
          />
          {event.orders[0] && event.orders[0].status !== "PAID" ? (
            <div className="border-l-2 border-burgundy bg-rose/15 px-4 py-3">
              <p className="text-sm font-medium capitalize">Payment {event.orders[0].status.toLowerCase()}</p>
              <Link href={`/dashboard/transactions/${event.orders[0].id}`} className="mt-1 inline-block text-sm text-burgundy underline">
                View order and continue payment
              </Link>
              <p className="mt-1 text-xs text-charcoal/60">Guest access and contributions remain inactive until payment is verified.</p>
            </div>
          ) : null}
          <Link href={`/e/${event.slug}`} className={cn(buttonVariants({ variant: "outline" }))}>
            Open Guest Page
          </Link>
          <Link href={`/e/${event.slug}/gallery`} className={cn(buttonVariants({ variant: "ghost" }))}>
            View Gallery
          </Link>
          <Link href={`/dashboard/events/${event.id}/moderation`} className={cn(buttonVariants())}>
            Review Memories{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Link>
        </div>
        <div
          className="aspect-[4/3] bg-cream-deep bg-cover bg-center"
          style={event.coverImageKey ? { backgroundImage: `url("${event.coverImageKey.replaceAll('"', '%22')}")` } : undefined}
          role="img"
          aria-label={event.coverImageKey ? `Cover for ${event.name}` : "No event cover image"}
        />
      </section>

      <details className="border-y border-charcoal/10 py-4">
        <summary className="cursor-pointer font-display text-xl">Event schedule</summary>
        <p className="my-3 text-sm text-charcoal/65">
          Contributions open at the scheduled start and stop at the scheduled end. Choose the event&apos;s local time zone.
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
          <p className="text-xs uppercase tracking-[0.2em] text-burgundy">Guest access</p>
          <h2 className="font-display text-2xl">One link for every perspective.</h2>
          <p className="break-all text-sm text-charcoal/70">{eventUrl}</p>
          <div className="flex flex-wrap gap-3">
            <CopyEventLink url={eventUrl} />
            <a href={`/api/events/${event.slug}/qr`} className={cn(buttonVariants({ variant: "ghost" }))}>
              Download QR
            </a>
          </div>
        </div>
        <Card className="flex flex-col items-center gap-3 border-charcoal/10 bg-white p-4">
          <Image
            src={`data:image/png;base64,${qrCode.toString("base64")}`}
            alt={`QR code for ${event.name}`}
            width={224}
            height={224}
            unoptimized
          />
          <p className="text-xs uppercase tracking-[0.15em] text-charcoal/55">Scan to open event</p>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Collection overview</h2>
        <div className="grid gap-px border border-charcoal/10 bg-charcoal/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Memories", String(event._count.memories)],
            ["Photos", String(photos)],
            ["Videos", String(videos)],
            ["Pending", String(pendingCount)],
            ["Approved", String(approvedCount)],
            ["Rejected", String(rejectedCount)],
            ["Storage", `${formatGb(usedBytes)} used · ${formatGb(quotaBytes)} quota`],
          ].map(([label, value]) => (
            <div key={label} className="bg-cream px-5 py-4">
              <p className="text-xs uppercase tracking-[0.15em] text-charcoal/55">{label}</p>
              <p className="mt-2 font-display text-xl text-burgundy">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
