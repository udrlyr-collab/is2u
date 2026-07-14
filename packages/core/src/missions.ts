import { DateTime, Interval } from "luxon";
import { MISSION_TYPES, type MissionType } from "./types";

export type MissionWindowOptions = {
  timezone?: string;
  notificationStartHour?: number;
  notificationEndHour?: number;
  delayMinutes?: number;
  endBufferMinutes?: number;
  notBefore?: Date;
};

export type MissionDateEventState = {
  status: "scheduled" | "active" | "completed" | "cancelled";
  isTest: boolean;
  startAt: Date;
  endAt: Date;
  deletedAt?: Date | null;
};

export function canCreateActualMission(event: MissionDateEventState, now = new Date()): boolean {
  return !event.isTest && !event.deletedAt && event.status === "active" && event.startAt <= now && event.endAt > now;
}

export function canDeliverActualMission(event: MissionDateEventState, now = new Date(), delayMinutes = 20, endBufferMinutes = 15): boolean {
  const earliest = event.startAt.getTime() + delayMinutes * 60_000;
  const latest = event.endAt.getTime() - endBufferMinutes * 60_000;
  return canCreateActualMission(event, now) && now.getTime() >= earliest && now.getTime() <= latest;
}

export function allowedMissionIntervals(start: Date, end: Date, options: MissionWindowOptions = {}): Interval[] {
  const zone = options.timezone ?? "Asia/Seoul";
  const startHour = options.notificationStartHour ?? 10;
  const endHour = options.notificationEndHour ?? 22;
  const delayedFromStart = DateTime.fromJSDate(start, { zone: "utc" }).setZone(zone).plus({ minutes: options.delayMinutes ?? 20 });
  const notBefore = options.notBefore
    ? DateTime.fromJSDate(options.notBefore, { zone: "utc" }).setZone(zone)
    : delayedFromStart;
  const delayed = DateTime.max(delayedFromStart, notBefore);
  const bufferedEnd = DateTime.fromJSDate(end, { zone: "utc" }).setZone(zone).minus({ minutes: options.endBufferMinutes ?? 15 });
  if (bufferedEnd <= delayed) return [];

  const result: Interval[] = [];
  let day = delayed.startOf("day");
  const lastDay = bufferedEnd.startOf("day");
  while (day <= lastDay) {
    const dailyStart = day.plus({ hours: startHour });
    const dailyEnd = day.plus({ hours: endHour });
    const candidateStart = DateTime.max(delayed, dailyStart);
    const candidateEnd = DateTime.min(bufferedEnd, dailyEnd);
    if (candidateEnd > candidateStart) result.push(Interval.fromDateTimes(candidateStart, candidateEnd));
    day = day.plus({ days: 1 });
  }
  return result;
}

export function chooseMissionTime(
  start: Date,
  end: Date,
  options: MissionWindowOptions = {},
  random = Math.random,
): Date | null {
  const intervals = allowedMissionIntervals(start, end, options);
  const total = intervals.reduce((sum, interval) => sum + interval.length("milliseconds"), 0);
  if (total <= 0) return null;
  let offset = random() * total;
  for (const interval of intervals) {
    const length = interval.length("milliseconds");
    if (offset <= length) return interval.start!.plus({ milliseconds: offset }).toUTC().toJSDate();
    offset -= length;
  }
  return intervals.at(-1)!.end!.toUTC().toJSDate();
}

export function chooseMissionType(previous: MissionType | null, random = Math.random): MissionType {
  const candidates = previous ? MISSION_TYPES.filter((type) => type !== previous) : [...MISSION_TYPES];
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
}

export function chooseRecipient(
  first: { id: string; delivered: number },
  second: { id: string; delivered: number },
  random = Math.random,
): string {
  if (first.delivered < second.delivered) return first.id;
  if (second.delivered < first.delivered) return second.id;
  return random() < 0.5 ? first.id : second.id;
}

export function seoulWeekBounds(at: Date): { start: Date; end: Date } {
  const local = DateTime.fromJSDate(at, { zone: "utc" }).setZone("Asia/Seoul");
  return {
    start: local.startOf("week").toUTC().toJSDate(),
    end: local.endOf("week").toUTC().toJSDate(),
  };
}
