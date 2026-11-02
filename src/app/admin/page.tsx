import { auth } from "@/auth";
import { BrandLogo } from "@/components/layout/brand-logo";
import { PageHeader } from "@/components/layout/page-header";
import { canAccessAdmin } from "@/server/authorization/policies";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || !canAccessAdmin(session.user)) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-charcoal/10 px-4 py-4">
        <BrandLogo />
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <PageHeader
          eyebrow="Admin"
          title="Operations console"
          description="Package limits, partners, and moderation tooling will be administered here. Role checks are already in place."
        />
      </main>
    </div>
  );
}
