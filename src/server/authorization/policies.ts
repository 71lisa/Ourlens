import type { EventPrivacy, EventStatus, UserRole } from "@/types/domain";
import { isValidTimeZone } from "@/lib/event-schedule";

export type AuthPrincipal = {
  id: string;
  role: UserRole;
};

export type EventAccessContext = {
  ownerId: string;
  privacyMode: EventPrivacy;
  grantUserIds?: string[];
};

export type GuestEventAccessContext = {
  isPaid?: boolean;
  privacyMode: EventPrivacy;
  status: EventStatus;
  expiresAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timeZone: string | null;
};

export type EffectiveGuestEventStatus =
  | EventStatus
  | "ONGOING"
  | "SCHEDULE_UNAVAILABLE";

export const PUBLIC_GALLERY_MODERATION_STATUSES = ["APPROVED"] as const;

export type ModerationDecision = "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";

export function canModerateEvent(
  principal: AuthPrincipal | null | undefined,
  event: Pick<EventAccessContext, "ownerId">,
): boolean {
  return principal?.role === "ADMIN" ||
    (principal?.role === "ORGANIZER" && principal.id === event.ownerId);
}

export function isGalleryModerationVisible(status: ModerationDecision): boolean {
  return (PUBLIC_GALLERY_MODERATION_STATUSES as readonly string[]).includes(status);
}

export function isAdmin(principal: AuthPrincipal | null | undefined): boolean {
  return principal?.role === "ADMIN";
}

export function canAccessAdmin(principal: AuthPrincipal | null | undefined): boolean {
  return isAdmin(principal);
}

export function canManageEvent(
  principal: AuthPrincipal | null | undefined,
  event: EventAccessContext,
): boolean {
  if (!principal) {
    return false;
  }
  if (principal.role === "ADMIN") {
    return true;
  }
  if (principal.id === event.ownerId) {
    return true;
  }
  if (
    (principal.role === "ORGANIZER" || principal.role === "PARTNER") &&
    event.grantUserIds?.includes(principal.id)
  ) {
    return true;
  }
  return false;
}

export function canUploadToEvent(
  principal: AuthPrincipal | null | undefined,
  event: EventAccessContext,
  hasGuestToken: boolean,
): boolean {
  if (canManageEvent(principal, event)) {
    return true;
  }

  switch (event.privacyMode) {
    case "PUBLIC_LINK":
    case "UPLOAD_ONLY":
    case "MODERATED":
      return hasGuestToken || principal?.role === "GUEST" || Boolean(principal);
    case "PRIVATE":
      return Boolean(principal && principal.role !== "GUEST");
    default:
      return false;
  }
}

export function canAcceptGuestContributions(
  event: GuestEventAccessContext,
  now = new Date(),
): boolean {
  return (
    event.isPaid === true &&
    getEffectiveGuestEventStatus(event, now) === "ONGOING" &&
    event.privacyMode !== "PRIVATE" &&
    (!event.expiresAt || event.expiresAt > now)
  );
}

export function getEffectiveGuestEventStatus(
  event: GuestEventAccessContext,
  now = new Date(),
): EffectiveGuestEventStatus {
  if (event.status === "DRAFT" || event.status === "COMPLETED" ||
      event.status === "ARCHIVED" || event.status === "EXPIRED") {
    return event.status;
  }
  if (event.expiresAt && !Number.isFinite(event.expiresAt.getTime())) {
    return "SCHEDULE_UNAVAILABLE";
  }
  if (event.expiresAt && event.expiresAt <= now) return "EXPIRED";
  if (
    !event.startsAt ||
    !event.endsAt ||
    !Number.isFinite(event.startsAt.getTime()) ||
    !Number.isFinite(event.endsAt.getTime()) ||
    event.endsAt <= event.startsAt ||
    !event.timeZone ||
    !isValidTimeZone(event.timeZone)
  ) {
    return "SCHEDULE_UNAVAILABLE";
  }
  if (now < event.startsAt) return "UPCOMING";
  if (now >= event.endsAt) return "COMPLETED";
  return "ONGOING";
}

export function canAccessGuestEventPage(
  event: Pick<GuestEventAccessContext, "privacyMode" | "status" | "isPaid">,
): boolean {
  return (
    event.isPaid === true &&
    event.privacyMode !== "PRIVATE" &&
    ["UPCOMING", "LIVE", "COMPLETED", "EXPIRED"].includes(event.status)
  );
}

export function canViewEventGallery(
  event: Pick<GuestEventAccessContext, "privacyMode" | "status" | "isPaid">,
): boolean {
  return (
    event.isPaid === true &&
    (event.privacyMode === "PUBLIC_LINK" || event.privacyMode === "MODERATED") &&
    ["UPCOMING", "LIVE", "COMPLETED", "EXPIRED"].includes(event.status)
  );
}

export function isRetainedMediaAvailable(expiresAt: Date | null, now = new Date()): boolean {
  return !expiresAt || expiresAt > now;
}

export function canAccessOrganizerDashboard(
  principal: AuthPrincipal | null | undefined,
): boolean {
  if (!principal) {
    return false;
  }
  return (
    principal.role === "ADMIN" ||
    principal.role === "ORGANIZER" ||
    principal.role === "PARTNER"
  );
}
