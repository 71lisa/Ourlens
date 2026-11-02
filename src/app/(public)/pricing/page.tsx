import { Container, PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getActivePackages } from "@/server/packages/catalog";

function formatPrice(price: string, currency: string, configured: boolean) {
  if (!configured) return "Price not configured";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(price));
}

export default async function PricingPage() {
  const packages = await getActivePackages();
  return (
    <Container className="py-16">
      <PageHeader
        eyebrow="Pricing"
        title="Pay per event, not per seat."
        description="Compare the current package limits and features. Package information and prices come from the OurLens package catalog."
      />
      {packages.length ? (
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {packages.map((item) => (
            <article key={item.id} className="border border-charcoal/10 bg-white p-5">
              <h2 className="font-display text-2xl">{item.name}</h2>
              <p className="mt-2 font-medium text-burgundy">
                {formatPrice(item.price, item.currency, item.priceConfigured)}
              </p>
              <dl className="mt-5 space-y-2 text-sm text-charcoal/70">
                <div><dt className="inline font-medium">Storage: </dt><dd className="inline">{(Number(item.storageLimitBytes) / 1024 ** 3).toFixed(0)} GB</dd></div>
                <div><dt className="inline font-medium">Photo limit: </dt><dd className="inline">{item.photoLimit ?? "Flexible"}</dd></div>
                <div><dt className="inline font-medium">Video limit: </dt><dd className="inline">{item.videoLimit ?? "Flexible"}</dd></div>
                <div><dt className="inline font-medium">Maximum video duration: </dt><dd className="inline">{item.videoDurationLimit ? `${item.videoDurationLimit} sec` : "Not configured"}</dd></div>
                <div><dt className="inline font-medium">Event duration: </dt><dd className="inline">{item.eventDurationDays} days</dd></div>
                <div><dt className="inline font-medium">Retention: </dt><dd className="inline">{item.retentionDays} days</dd></div>
              </dl>
              <p className="mt-5 border-t border-charcoal/10 pt-4 text-xs text-charcoal/60">
                Current database features: {[
                  item.customEventPage && "Custom event page",
                  item.customQRCode && "Custom QR code",
                  item.filtersEnabled && "Filters",
                  item.framesEnabled && "Frames",
                  item.aiEnhancementEnabled && "AI enhancement",
                  item.aiCurationEnabled && "AI curation",
                  item.digitalAlbumEnabled && "Digital album",
                  item.liveMomentEnabled && "Live Moment",
                  item.eventChallengesEnabled && "Challenges",
                ].filter(Boolean).join(", ") || "No optional features enabled"}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-sm text-charcoal/70">No active packages are available.</p>
      )}
      <p className="mt-8 max-w-2xl text-sm text-charcoal/70">
        A price shown as “not configured” is not a free package. Checkout is unavailable until an
        administrator configures the IDR price in the package catalog.
      </p>
      <Link href="/dashboard/events/create" className={cn(buttonVariants(), "mt-6")}>Create an event</Link>
    </Container>
  );
}
