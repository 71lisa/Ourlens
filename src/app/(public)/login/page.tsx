import Link from "next/link";
import { Container, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <Container className="flex max-w-lg flex-col py-16">
      <PageHeader
        eyebrow="Organizers"
        title="Welcome back."
        description="Log in to manage your events. Guests never need an account to contribute."
      />
      <Card className="mt-10">
        <LoginForm />
      </Card>
      <p className="mt-4 text-sm text-charcoal/70">
        New here?{" "}
        <Link href="/register" className="text-burgundy underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </Container>
  );
}
