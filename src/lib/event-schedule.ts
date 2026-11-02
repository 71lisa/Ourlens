const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parseWallTime(date: string, time: string): WallTime | undefined {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return undefined;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return undefined;
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return { year, month, day, hour, minute };
}

function formatterForTimeZone(timeZone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return undefined;
  }
}

function wallTimeAt(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): WallTime | undefined {
  const parts = formatter.formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return undefined;
  return { year, month, day, hour, minute };
}

function sameWallTime(left: WallTime | undefined, right: WallTime): boolean {
  return left?.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute;
}

function asUtcMilliseconds(value: WallTime): number {
  const date = new Date(0);
  date.setUTCFullYear(value.year, value.month - 1, value.day);
  date.setUTCHours(value.hour, value.minute, 0, 0);
  return date.getTime();
}

export function isValidTimeZone(timeZone: string): boolean {
  return formatterForTimeZone(timeZone) !== undefined;
}

export function formatZonedDateTimeInput(
  instant: Date,
  timeZone: string,
): { date: string; time: string } | undefined {
  const formatter = formatterForTimeZone(timeZone);
  if (!formatter || !Number.isFinite(instant.getTime())) return undefined;
  const value = wallTimeAt(instant, formatter);
  if (!value) return undefined;
  return {
    date: `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`,
    time: `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`,
  };
}

export function resolveZonedDateTime(
  date: string,
  time: string,
  timeZone: string,
): Date | undefined {
  const wallTime = parseWallTime(date, time);
  const formatter = formatterForTimeZone(timeZone);
  if (!wallTime || !formatter) return undefined;

  const wallMilliseconds = asUtcMilliseconds(wallTime);
  const offsets = new Set<number>();
  const probeRangeHours = 48;
  const probeIntervalHours = 3;
  for (let hours = -probeRangeHours; hours <= probeRangeHours; hours += probeIntervalHours) {
    const probe = new Date(wallMilliseconds + hours * 60 * 60 * 1000);
    const localTime = wallTimeAt(probe, formatter);
    if (!localTime) return undefined;
    offsets.add(asUtcMilliseconds(localTime) - probe.getTime());
  }

  const candidates = new Set<number>();
  for (const offset of offsets) {
    const instant = wallMilliseconds - offset;
    if (sameWallTime(wallTimeAt(new Date(instant), formatter), wallTime)) {
      candidates.add(instant);
    }
  }

  return candidates.size === 1 ? new Date([...candidates][0]) : undefined;
}
