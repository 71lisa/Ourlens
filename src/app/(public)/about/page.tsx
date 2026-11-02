import { Container, PageHeader } from "@/components/layout/page-header";

export default function AboutPage() {
  return (
    <Container className="py-16">
      <PageHeader
        eyebrow="About"
        title="Collective memory, not a replacement for photography."
        description="OurLens is for the perspectives that sit at every table, dance floor, and quiet hallway. Professional photographers still tell the official story. Guests tell the rest."
      />
    </Container>
  );
}
