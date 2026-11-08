import Link from "next/link";
import { Container, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { RegisterForm } from "@/features/auth/register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const referralCode = typeof ref === "string" && /^OL-[A-Fa-f0-9]{24}$/.test(ref)
    ? ref.toUpperCase()
    : "";

  return (
    <Container className="flex max-w-lg flex-col py-16">
      <PageHeader
        eyebrow="Mulai"
        title="Buat akun penyelenggara Anda."
        description="Pembuatan acara, kode QR, dan galeri menyusul. Akun ini adalah fondasinya."
      />
      <Card className="mt-10">
        <RegisterForm referralCode={referralCode} />
      </Card>
      <p className="mt-4 text-sm text-charcoal/70">
        Sudah mendaftar?{" "}
        <Link href="/login" className="text-burgundy underline-offset-4 hover:underline">
          Masuk
        </Link>
      </p>
    </Container>
  );
}
