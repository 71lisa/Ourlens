import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { auth } from "@/auth";
import { prisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";
import { getEffectiveGuestEventStatus } from "@/server/authorization/policies";
import { isValidTimeZone } from "@/lib/event-schedule";

const eventTypeLabels: Record<string, string> = {
  WEDDING: "Wedding",
  BIRTHDAY: "Birthday",
  GRADUATION: "Graduation",
  REUNION: "Reunion",
  CORPORATE: "Corporate",
  PARTY: "Party",
  SCHOOL: "School",
  FAMILY: "Family",
  OTHER: "Other",
};

function storageLabel(bytes: bigint) {
  return `${(Number(bytes) / 1024 ** 3).toFixed(1)} GB`;
}

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    redirect("/login");
  }

  const events = await prisma.event.findMany({
    where: session.user.role === "ADMIN" ? undefined : { ownerId: session.user.id },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { memories: true } },
      storageUsage: { select: { usedBytes: true, quotaBytes: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Your events" description="Every celebration, gathered in one place." />
        <Link href="/dashboard/events/create" className={cn(buttonVariants())}>
          Create event
        </Link>
      </div>
      {events.length ? (
        <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
          {events.map((event) => (
            <article key={event.id} className="grid gap-4 py-5 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
              <div
                className="aspect-[4/3] bg-cream-deep bg-cover bg-center"
                style={event.coverImageKey ? { backgroundImage: `url("${event.coverImageKey.replaceAll('"', '%22')}")` } : undefined}
                role="img"
                aria-label={event.coverImageKey ? `Cover for ${event.name}` : "No event cover image"}
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-burgundy">{eventTypeLabels[event.eventType] ?? event.eventType}</p>
                <h2 className="mt-1 truncate font-display text-2xl">{event.name}</h2>
                <p className="mt-1 text-sm text-charcoal/65">
                  {event.startsAt && event.timeZone && isValidTimeZone(event.timeZone)
                    ? new Intl.DateTimeFormat("en", {
                        dateStyle: "long",
                        timeStyle: "short",
                        timeZone: event.timeZone,
                      }).format(event.startsAt)
                    : "Schedule unavailable"}
                  <span className="mx-2 text-charcoal/30">·</span>{getEffectiveGuestEventStatus(event)}
                </p>
                <p className="mt-2 text-xs text-charcoal/60">
                  {event._count.memories} memories
                  {event.storageUsage ? ` · ${storageLabel(event.storageUsage.usedBytes)} of ${storageLabel(event.storageUsage.quotaBytes)} used` : " · Storage not initialized"}
                </p>
              </div>
              <Link href={`/dashboard/events/${event.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
                Open event
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Your first event starts here" description="Create an event to get its own guest link and QR code." />
      )}
    </div>
  );
}
