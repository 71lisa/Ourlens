import { z } from "zod";
import { resolveZonedDateTime } from "@/lib/event-schedule";

export const EVENT_TYPES = [
  "WEDDING",
  "BIRTHDAY",
  "GRADUATION",
  "REUNION",
  "CORPORATE",
  "PARTY",
  "OTHER",
] as const;

const eventScheduleFields = {
  eventDate: z.iso.date("Choose a valid start date."),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a valid start time."),
  endDate: z.iso.date("Choose a valid end date."),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a valid end time."),
  timeZone: z.string().trim().min(1, "Enter the event time zone.").max(100),
};

export type EventScheduleInput = {
  eventDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
};

function validateEventSchedule(value: EventScheduleInput, context: z.RefinementCtx) {
  const schedule = getEventSchedule(value);
  if (!schedule) {
    context.addIssue({
      code: "custom",
      path: ["timeZone"],
      message: "Choose a valid time and time zone. Times skipped or repeated by daylight saving are not supported.",
    });
    return;
  }
  if (schedule.endsAt <= schedule.startsAt) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "The event end must be after its start.",
    });
  }
}

export const eventScheduleSchema = z.object(eventScheduleFields).superRefine(validateEventSchedule);

export const createEventSchema = z.object({
  name: z.string().trim().min(1, "Enter an event name.").max(120, "Event names must be 120 characters or fewer."),
  eventType: z.enum(EVENT_TYPES, { error: "Choose an event type." }),
  ...eventScheduleFields,
  location: z.string().trim().max(160, "Location must be 160 characters or fewer.").optional(),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer.").optional(),
  coverImageUrl: z
    .union([z.literal(""), z.url("Enter a valid cover image URL.")])
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || ["http:", "https:"].includes(new URL(value).protocol), {
      message: "Cover image URLs must use HTTPS or HTTP.",
    }),
  privacyMode: z.enum(["PUBLIC_LINK", "PRIVATE"], { error: "Choose an event privacy setting." }),
  packageId: z.string().min(1, "Choose a package."),
}).superRefine((value, context) => {
  validateEventSchedule(value, context);
});

export function getEventSchedule(input: EventScheduleInput) {
  const startsAt = resolveZonedDateTime(input.eventDate, input.startTime, input.timeZone);
  const endsAt = resolveZonedDateTime(input.endDate, input.endTime, input.timeZone);
  return startsAt && endsAt ? { startsAt, endsAt } : undefined;
}

export type CreateEventInput = z.infer<typeof createEventSchema>;