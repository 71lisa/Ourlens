import { Container, PageHeader } from "@/components/layout/page-header";

export default function AboutPage() {
  return (
    <Container className="py-16">
      <PageHeader
        eyebrow="Tentang"
        title="Kenangan kolektif, bukan pengganti fotografi."
        description="OurLens hadir untuk perspektif yang ada di setiap meja, lantai dansa, dan lorong yang tenang. Fotografer profesional tetap menceritakan kisah resmi. Tamu menceritakan sisanya."
      />
    </Container>
  );
}
