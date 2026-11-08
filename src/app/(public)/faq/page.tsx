import { Container, PageHeader } from "@/components/layout/page-header";

const faqs = [
  {
    q: "Apakah tamu perlu menginstal aplikasi?",
    a: "Tidak. Tamu cukup memindai kode QR dan menggunakan pengalaman web di ponsel.",
  },
  {
    q: "Apakah OurLens menggantikan fotografer?",
    a: "Tidak. Fotografer mendokumentasikan cerita resmi. OurLens mengumpulkan perspektif tamu.",
  },
  {
    q: "Bagaimana penagihan acara dilakukan?",
    a: "Paket bayar per acara dengan batas yang bisa diatur. Pembayaran belum aktif di tahap fondasi ini.",
  },
];

export default function FaqPage() {
  return (
    <Container className="py-16">
      <PageHeader eyebrow="Pertanyaan Umum" title="Pertanyaan yang sering muncul." />
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
