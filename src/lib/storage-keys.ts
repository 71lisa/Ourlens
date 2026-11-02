export type StorageKeyKind = "photo" | "video" | "album";
export type StorageKeyVariant = "original" | "edited" | "thumbnail";

export function buildStorageKey(input: {
  eventId: string;
  mediaId?: string;
  variant?: StorageKeyVariant;
  kind: StorageKeyKind;
  suffix?: string;
}): string {
  const mediaId = input.mediaId ?? "unassigned";
  const variant = input.variant ?? "original";
  const cleanEventId = input.eventId.replace(/^\/+|\/+$/g, "").replace(/\.\./g, "");
  const cleanMediaId = mediaId.replace(/^\/+|\/+$/g, "").replace(/\.\./g, "");
  const base = ["events", cleanEventId, input.kind === "album" ? "albums" : `${input.kind}s`, cleanMediaId, variant]
    .filter(Boolean)
    .join("/");

  return input.suffix ? `${base}/${input.suffix.replace(/^\/+/, "")}` : base;
}

export function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("..")) {
    return false;
  }
  const normalized = key.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.length >= 3 && segments[0] === "events" && !segments.some((segment) => segment === "" || segment === ".");
}
