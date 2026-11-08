import Link from "next/link";
import { Container, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";

  return (
    <Container className="flex max-w-lg flex-col py-16">
      <PageHeader
        eyebrow="OurLens"
        title="Selamat datang kembali."
        description="Masuk ke akun OurLens untuk melanjutkan ke ruang kerja Anda. Tamu tidak perlu akun untuk berkontribusi."
      />
      <Card className="mt-10">
        <LoginForm callbackUrl={callbackUrl} />
      </Card>
      <p className="mt-4 text-sm text-charcoal/70">
        Baru di sini?{" "}
        <Link href="/register" className="text-burgundy underline-offset-4 hover:underline">
          Buat akun
        </Link>
      </p>
    </Container>
  );
}
