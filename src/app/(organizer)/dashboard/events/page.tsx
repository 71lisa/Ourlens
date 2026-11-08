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
import { getEventStatusLabel, getEventTypeLabel } from "@/lib/event-type";

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
        <PageHeader title="Acara Anda" description="Setiap perayaan, terkumpul dalam satu tempat." />
        <Link href="/dashboard/events/create" className={cn(buttonVariants())}>
          Buat acara
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
                aria-label={event.coverImageKey ? `Sampul acara ${event.name}` : "Belum ada foto sampul acara"}
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-burgundy">{getEventTypeLabel(event.eventType)}</p>
                <h2 className="mt-1 truncate font-display text-2xl">{event.name}</h2>
                <p className="mt-1 text-sm text-charcoal/65">
                  {event.startsAt && event.timeZone && isValidTimeZone(event.timeZone)
                    ? new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "long",
                        timeStyle: "short",
                        timeZone: event.timeZone,
                      }).format(event.startsAt)
                    : "Jadwal tidak tersedia"}
                  <span className="mx-2 text-charcoal/30">·</span>{getEventStatusLabel(getEffectiveGuestEventStatus(event))}
                </p>
                <p className="mt-2 text-xs text-charcoal/60">
                  {event._count.memories} kenangan
                  {event.storageUsage ? ` · ${storageLabel(event.storageUsage.usedBytes)} dari ${storageLabel(event.storageUsage.quotaBytes)} terpakai` : " · Penyimpanan belum diinisialisasi"}
                </p>
              </div>
              <Link href={`/dashboard/events/${event.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
                Buka acara
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Acara pertama Anda dimulai di sini" description="Buat acara untuk mendapatkan tautan tamu dan kode QR sendiri." />
      )}
    </div>
  );
}
