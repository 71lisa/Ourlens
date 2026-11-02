import Link from "next/link";
import { Container, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { RegisterForm } from "@/features/auth/register-form";

export default function RegisterPage() {
  return (
    <Container className="flex max-w-lg flex-col py-16">
      <PageHeader
        eyebrow="Get started"
        title="Create your organizer account."
        description="Event creation, QR codes, and galleries come next. This account is the foundation."
      />
      <Card className="mt-10">
        <RegisterForm />
      </Card>
      <p className="mt-4 text-sm text-charcoal/70">
        Already registered?{" "}
        <Link href="/login" className="text-burgundy underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </Container>
  );
}
