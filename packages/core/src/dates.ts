import { DateTime } from "luxon";

export const APP_TIMEZONE = "Asia/Seoul";

const seoulPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function seoulDayKey(value: Date | string): string {
  const parts = seoulPartsFormatter.formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function expandSeoulDayKeys(startAt: Date | string, endAt: Date | string): string[] {
  const startKey = seoulDayKey(startAt);
  const endKey = seoulDayKey(endAt);
  const cursor = new Date(`${startKey}T00:00:00+09:00`);
  const end = new Date(`${endKey}T00:00:00+09:00`);
  const keys: string[] = [];
  while (cursor <= end && keys.length < 370) {
    keys.push(seoulDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

const SEOUL_INPUT_FORMAT = "yyyy-LL-dd'T'HH:mm";

export function parseSeoulDateTimeInput(value: string): Date | null {
  const parsed = DateTime.fromFormat(value, SEOUL_INPUT_FORMAT, { zone: APP_TIMEZONE, setZone: true });
  return parsed.isValid ? parsed.toUTC().toJSDate() : null;
}

export function toSeoulDateTimeInput(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(APP_TIMEZONE).toFormat(SEOUL_INPUT_FORMAT);
}
