import { Container, PageHeader } from "@/components/layout/page-header";

const faqs = [
  {
    q: "Do guests need to install an app?",
    a: "No. Guests scan a QR code and use the mobile web experience.",
  },
  {
    q: "Does OurLens replace a photographer?",
    a: "No. Photographers document the official story. OurLens collects guest perspectives.",
  },
  {
    q: "How are events billed?",
    a: "Pay-per-event packages, with configurable limits. Payments are not live in this foundation phase.",
  },
];

export default function FaqPage() {
  return (
    <Container className="py-16">
      <PageHeader eyebrow="FAQ" title="Questions we hear first." />
      <dl className="mt-12 max-w-2xl space-y-8">
        {faqs.map((item) => (
          <div key={item.q}>
            <dt className="font-display text-2xl">{item.q}</dt>
            <dd className="mt-2 text-charcoal/75">{item.a}</dd>
          </div>
        ))}
      </dl>
    </Container>
  );
}
