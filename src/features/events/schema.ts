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
  eventDate: z.iso.date("Pilih tanggal mulai yang valid."),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Pilih waktu mulai yang valid."),
  endDate: z.iso.date("Pilih tanggal berakhir yang valid."),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Pilih waktu berakhir yang valid."),
  timeZone: z.string().trim().min(1, "Masukkan zona waktu acara.").max(100),
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
      message: "Pilih waktu dan zona waktu yang valid. Waktu yang terlewat atau berulang akibat perubahan waktu musim tidak didukung.",
    });
    return;
  }
  if (schedule.endsAt <= schedule.startsAt) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "Waktu berakhir harus setelah waktu mulai.",
    });
  }
}

export const eventScheduleSchema = z.object(eventScheduleFields).superRefine(validateEventSchedule);

export const createEventSchema = z.object({
  name: z.string().trim().min(1, "Masukkan nama acara.").max(120, "Nama acara maksimal 120 karakter."),
  organizerName: z.string().trim().max(120, "Nama penyelenggara maksimal 120 karakter.").optional(),
  eventType: z.enum(EVENT_TYPES, { error: "Pilih jenis acara." }),
  ...eventScheduleFields,
  location: z.string().trim().max(160, "Lokasi maksimal 160 karakter.").optional(),
  description: z.string().trim().max(500, "Deskripsi maksimal 500 karakter.").optional(),
  coverImageUrl: z
    .union([z.literal(""), z.url("Masukkan tautan gambar sampul yang valid.")])
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || ["http:", "https:"].includes(new URL(value).protocol), {
      message: "Tautan gambar sampul harus menggunakan HTTPS atau HTTP.",
    }),
  privacyMode: z.enum(["PUBLIC_LINK", "PRIVATE"], { error: "Pilih pengaturan privasi acara." }),
  packageId: z.string().min(1, "Pilih paket."),
  filter: z.enum(["ORIGINAL", "DISPOSABLE_CAM", "VINTAGE_FILM", "RETRO", "CLASSIC"])
    .default("ORIGINAL"),
  frame: z.enum(["NO_FRAME", "POLAROID_WHITE", "POLAROID_VINTAGE", "FILM_FRAME", "MINIMAL_FRAME"])
    .default("NO_FRAME"),
}).superRefine((value, context) => {
  validateEventSchedule(value, context);
});

export function getEventSchedule(input: EventScheduleInput) {
  const startsAt = resolveZonedDateTime(input.eventDate, input.startTime, input.timeZone);
  const endsAt = resolveZonedDateTime(input.endDate, input.endTime, input.timeZone);
  return startsAt && endsAt ? { startsAt, endsAt } : undefined;
}

export type CreateEventInput = z.infer<typeof createEventSchema>;