import { PageHeader } from "@/components/layout/page-header";
import { CreateEventForm } from "@/features/events/create-event-form";
import { getActivePackages } from "@/server/packages/catalog";
import { randomUUID } from "node:crypto";

export default async function CreateEventPage() {
  const packages = await getActivePackages();
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="A new collection begins"
        title="Create your event."
        description="Bring every guest’s perspective into one place. Add the details now; your private event space and guest link are created together."
      />
      <CreateEventForm packages={packages} idempotencyKey={randomUUID()} />
    </div>
  );
}
