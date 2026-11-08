import { Container, PageHeader } from "@/components/layout/page-header";

const steps = [
  "Penyelenggara membuat acara.",
  "OurLens menghasilkan URL dan kode QR unik.",
  "Tamu memindai dengan ponsel mereka — tidak perlu aplikasi.",
  "Foto, video, dan pesan terkumpul dalam satu galeri.",
];

export default function HowItWorksPage() {
  return (
    <Container className="py-16">
      <PageHeader
        eyebrow="Cara kerja"
        title="Pindai → Ambil → Bagikan → Kumpulkan → Kenang Kembali"
        description="Panduan praktis untuk berbagi momen acara. Pengalaman tamu dirancang agar nyaman digunakan di ponsel."
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
