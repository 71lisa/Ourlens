import { Container, PageHeader } from "@/components/layout/page-header";

const steps = [
  "An organizer creates an event.",
  "OurLens generates a unique URL and QR code.",
  "Guests scan with their phones — no app required.",
  "Photos, videos, and messages collect in one gallery.",
];

export default function HowItWorksPage() {
  return (
    <Container className="py-16">
      <PageHeader
        eyebrow="How it works"
        title="Scan → Capture → Share → Collect → Relive"
        description="This page will grow into a full walkthrough. The guest path stays mobile-first and lightweight."
      />
      <ol className="mt-12 max-w-xl space-y-4">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-4 text-charcoal/80">
            <span className="font-display text-2xl text-burgundy">{index + 1}</span>
            <span className="pt-1">{step}</span>
          </li>
        ))}
      </ol>
    </Container>
  );
}
