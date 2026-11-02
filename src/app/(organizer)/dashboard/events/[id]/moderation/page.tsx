import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { prisma } from "@/server/db/prisma";
import { ModerationControls } from "@/features/moderation/moderation-controls";

const statusClassName = {
  PENDING: "border-beige/50 bg-beige/20 text-charcoal",
  APPROVED: "border-green-800/20 bg-green-800/10 text-green-900",
  REJECTED: "border-burgundy/20 bg-burgundy/10 text-burgundy",
  FLAGGED: "border-rose bg-rose/25 text-burgundy",
} as const;

export default async function EventModerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, auth()]);
  if (!session?.user || !["ADMIN", "ORGANIZER"].includes(session.user.role)) {
    redirect("/login");
  }

  const event = await prisma.event.findFirst({
    where: session.user.role === "ADMIN" ? { id } : { id, ownerId: session.user.id },
    select: {
      id: true,
      name: true,
      mediaAssets: {
        where: { type: { in: ["PHOTO", "VIDEO"] }, uploadStatus: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          caption: true,
          createdAt: true,
          moderationStatus: true,
          memory: { select: { caption: true } },
        },
      },
    },
  });
  if (!event) notFound();

  const pending = event.mediaAssets.filter((asset) => asset.moderationStatus === "PENDING");
  const reviewed = event.mediaAssets.filter((asset) => asset.moderationStatus !== "PENDING");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="Memory review"
          title={event.name}
          description="Review each guest photo or video before it joins the public collection."
        />
        <Link href={`/dashboard/events/${event.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
          Back to event
        </Link>
      </div>

      {event.mediaAssets.length === 0 ? (
        <div className="border-y border-charcoal/10 py-14 text-center">
          <h2 className="font-display text-3xl">Your event doesn&apos;t have any memories yet.</h2>
          <p className="mt-2 text-sm text-charcoal/65">Guest photos and videos will appear here when they are shared.</p>
        </div>
      ) : null}

      {event.mediaAssets.length > 0 && pending.length === 0 ? (
        <div className="border-y border-charcoal/10 py-10 text-center">
          <h2 className="font-display text-3xl">You&apos;re all caught up.</h2>
          <p className="mt-2 text-sm text-charcoal/65">There are no memories waiting for review.</p>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl">Waiting for review</h2>
            <span className="text-sm text-charcoal/60">{pending.length} pending</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {pending.map((asset) => (
              <article key={asset.id} className="overflow-hidden border border-charcoal/10 bg-white">
                {asset.type === "VIDEO" ? (
                  <video
                    src={`/api/dashboard/events/${encodeURIComponent(event.id)}/media/${encodeURIComponent(asset.id)}`}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={asset.memory?.caption || asset.caption || `Video submitted to ${event.name}`}
                    className="max-h-[28rem] w-full bg-cream-deep"
                  />
                ) : (
                  <Image
                    src={`/api/dashboard/events/${encodeURIComponent(event.id)}/media/${encodeURIComponent(asset.id)}`}
                    alt={asset.memory?.caption || asset.caption || `Photo submitted to ${event.name}`}
                    width={1200}
                    height={900}
                    unoptimized
                    className="max-h-[28rem] w-full bg-cream-deep object-contain"
                  />
                )}
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={statusClassName[asset.moderationStatus]}>{asset.moderationStatus}</Badge>
                    <time className="text-xs text-charcoal/55" dateTime={asset.createdAt.toISOString()}>
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(asset.createdAt)}
                    </time>
                  </div>
                  <p className="min-h-6 whitespace-pre-wrap text-sm text-charcoal/80">
                    {asset.memory?.caption || asset.caption || "No caption"}
                  </p>
                  <ModerationControls eventId={event.id} mediaAssetId={asset.id} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {reviewed.length > 0 ? (
        <section className="space-y-4 border-t border-charcoal/10 pt-6">
          <div>
            <h2 className="font-display text-2xl">Reviewed memories</h2>
            {reviewed.some((asset) => asset.moderationStatus === "REJECTED") ? (
              <p className="mt-2 text-sm text-charcoal/65">Rejected memories are hidden from the public gallery.</p>
            ) : null}
          </div>
          <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
            {reviewed.map((asset) => (
              <div key={asset.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  {asset.type === "VIDEO" ? (
                    <video
                      src={`/api/dashboard/events/${encodeURIComponent(event.id)}/media/${encodeURIComponent(asset.id)}`}
                      muted
                      preload="metadata"
                      className="h-[4.5rem] w-[5.5rem] shrink-0 bg-cream-deep object-cover"
                    />
                  ) : (
                    <Image
                      src={`/api/dashboard/events/${encodeURIComponent(event.id)}/media/${encodeURIComponent(asset.id)}`}
                      alt=""
                      width={88}
                      height={72}
                      unoptimized
                      className="h-[4.5rem] w-[5.5rem] shrink-0 bg-cream-deep object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-charcoal/80">{asset.memory?.caption || asset.caption || "No caption"}</p>
                    <time className="mt-1 block text-xs text-charcoal/55" dateTime={asset.createdAt.toISOString()}>
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(asset.createdAt)}
                    </time>
                  </div>
                </div>
                <Badge className={statusClassName[asset.moderationStatus]}>{asset.moderationStatus}</Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}