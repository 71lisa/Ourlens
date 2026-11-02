import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/event-card";
import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Organizer"
        title={`Hello${session?.user?.name ? `, ${session.user.name}` : ""}.`}
        description="Your events, galleries, and packages will live here. This is the dashboard shell."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Events" value="—" />
        <StatCard label="Memories" value="—" />
        <StatCard label="Storage" value="—" />
      </div>
      <EmptyState
        title="No events yet"
        description="Event creation, QR codes, and guest galleries are planned for the next phases."
      />
    </div>
  );
}
