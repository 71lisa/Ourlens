import Link from "next/link";
import { Container } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { siteConfig } from "@/config/site";

const beats = [
  {
    step: "Scan",
    title: "Arrive through a QR code",
    copy: "Guests open a unique event link on their phone. No app install required.",
  },
  {
    step: "Share",
    title: "Everyone becomes a storyteller",
    copy: "Photos, videos, and notes gather into one living gallery as the night unfolds.",
  },
  {
    step: "Relive",
    title: "Collect the missed moments",
    copy: "The official photographer captures the story. OurLens captures everyone’s story.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-charcoal/10 bg-cream-deep/40">
        <Container className="grid gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.32em] text-burgundy">Event memory platform</p>
            <h1 className="font-display text-5xl leading-[1.05] text-charcoal sm:text-6xl lg:text-7xl">
              One Event.
              <br />
              Hundreds of Perspectives.
            </h1>
            <p className="max-w-xl text-lg text-charcoal/75">{siteConfig.description}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }))}>
                Create Your Event
              </Link>
              <Link
                href="/how-it-works"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                See How It Works
              </Link>
            </div>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden border border-charcoal/10 bg-charcoal">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#d9a6a8_0%,transparent_45%),radial-gradient(circle_at_80%_80%,#8b0000_0%,transparent_40%)] opacity-70" />
            <div className="absolute inset-6 border border-cream/20" />
            <div className="absolute bottom-8 left-8 right-8 text-cream">
              <p className="text-xs uppercase tracking-[0.3em] text-beige">Shared gallery</p>
              <p className="mt-2 font-display text-3xl">Scan. Capture. Relive.</p>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-16 lg:py-24">
        <Container>
          <div className="grid gap-10 md:grid-cols-3">
            {beats.map((beat) => (
              <article key={beat.step} className="border-t border-burgundy/40 pt-6">
                <p className="text-xs uppercase tracking-[0.28em] text-burgundy">{beat.step}</p>
                <h2 className="mt-3 font-display text-3xl">{beat.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-charcoal/70">{beat.copy}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
