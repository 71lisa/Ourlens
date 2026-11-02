export const USER_ROLES = ["ADMIN", "ORGANIZER", "PARTNER", "GUEST"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EVENT_STATUSES = [
  "DRAFT",
  "UPCOMING",
  "LIVE",
  "COMPLETED",
  "ARCHIVED",
  "EXPIRED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_PRIVACY_MODES = [
  "PUBLIC_LINK",
  "PRIVATE",
  "UPLOAD_ONLY",
  "MODERATED",
] as const;
export type EventPrivacy = (typeof EVENT_PRIVACY_MODES)[number];

export const MEDIA_TYPES = ["PHOTO", "VIDEO", "LIVE_MOMENT"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
