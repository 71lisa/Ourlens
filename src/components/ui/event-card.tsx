import Link from "next/link";
import { Badge } from "./badge";
import { Card } from "./card";

export function EventCard({
  name,
  href,
  dateLabel,
  status,
}: {
  name: string;
  href: string;
  dateLabel?: string;
  status?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl">
            <Link href={href} className="hover:text-burgundy">
              {name}
            </Link>
          </h3>
          {dateLabel ? <p className="mt-1 text-sm text-charcoal/70">{dateLabel}</p> : null}
        </div>
        {status ? <Badge>{status}</Badge> : null}
      </div>
    </Card>
  );
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.2em] text-charcoal/50">{label}</p>
      <p className="mt-2 font-display text-3xl text-burgundy">{value}</p>
    </Card>
  );
}
