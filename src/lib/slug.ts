const SLUG_MAX_LENGTH = 80;

export function slugifyEventName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);

  return normalized || "event";
}

export function uniqueEventSlug(
  base: string,
  existing: ReadonlySet<string>,
): string {
  const slugBase = slugifyEventName(base);
  if (!existing.has(slugBase)) {
    return slugBase;
  }

  let n = 2;
  while (existing.has(`${slugBase}-${n}`)) {
    n += 1;
  }
  return `${slugBase}-${n}`;
}

export function eventGuestPath(slug: string): string {
  return `/e/${slug}`;
}

export function eventGuestUrl(slug: string, appUrl: string): string {
  return new URL(eventGuestPath(slug), appUrl).toString();
}
