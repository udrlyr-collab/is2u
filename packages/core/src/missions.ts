import { DateTime, Interval } from "luxon";
import { MISSION_TEMPLATES, MISSION_TYPES, MISSION_TYPE_WEIGHTS, type MissionTemplate, type MissionType } from "./types";

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

export function chooseMissionTimeInRange(
  start: Date,
  end: Date,
  baseline: Date,
  minMinutes: number,
  maxMinutes: number,
  options: MissionWindowOptions = {},
  random = Math.random,
): Date | null {
  if (minMinutes > maxMinutes) return null;
  const zone = options.timezone ?? "Asia/Seoul";
  const lower = DateTime.fromJSDate(baseline, { zone: "utc" }).plus({ minutes: minMinutes });
  const upper = DateTime.fromJSDate(baseline, { zone: "utc" }).plus({ minutes: maxMinutes });
  const notBefore = options.notBefore ? DateTime.fromJSDate(options.notBefore, { zone: "utc" }) : lower;
  const rangeStart = DateTime.max(lower, notBefore);
  if (upper < rangeStart) return null;
  const range = Interval.fromDateTimes(rangeStart.setZone(zone), upper.setZone(zone).plus({ milliseconds: 1 }));
  const candidates = allowedMissionIntervals(start, end, { ...options, delayMinutes: 20 })
    .map((interval) => interval.intersection(range))
    .filter((interval): interval is Interval<true> => Boolean(interval?.isValid && interval.length("milliseconds") > 0));
  const total = candidates.reduce((sum, interval) => sum + interval.length("milliseconds"), 0);
  if (total <= 0) return null;
  let offset = random() * total;
  for (const interval of candidates) {
    const length = interval.length("milliseconds");
    if (offset <= length) return interval.start.plus({ milliseconds: offset }).toUTC().toJSDate();
    offset -= length;
  }
  return candidates.at(-1)!.end.toUTC().toJSDate();
}

export function chooseMissionType(previous: MissionType | null, random = Math.random): MissionType {
  const candidates = previous ? MISSION_TYPES.filter((type) => type !== previous) : [...MISSION_TYPES];
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
}

export function chooseMissionTemplate(
  recentTemplateIds: readonly string[] = [],
  requestedType: MissionType | null = null,
  random = Math.random,
): MissionTemplate {
  const activeTemplates = MISSION_TEMPLATES.filter((item) => item.enabled);
  let eligibleTypes = requestedType ? [requestedType] : MISSION_TYPES.filter((type) => activeTemplates.some((item) => item.type === type));
  const recentTemplates = recentTemplateIds.map((id) => MISSION_TEMPLATES.find((item) => item.id === id)).filter((item): item is MissionTemplate => Boolean(item));
  if (!requestedType && recentTemplates.length >= 2 && recentTemplates[0].type === recentTemplates[1].type && eligibleTypes.length > 1) {
    eligibleTypes = eligibleTypes.filter((type) => type !== recentTemplates[0].type);
  }
  const typeWeight = eligibleTypes.reduce((sum, type) => sum + Math.max(0, MISSION_TYPE_WEIGHTS[type]), 0);
  let typeCursor = random() * typeWeight;
  let selectedType = eligibleTypes[0];
  for (const type of eligibleTypes) {
    typeCursor -= Math.max(0, MISSION_TYPE_WEIGHTS[type]);
    if (typeCursor < 0) { selectedType = type; break; }
  }
  const enabled = activeTemplates.filter((item) => item.type === selectedType);
  const recentThree = recentTemplateIds.slice(0, 3);
  const withoutRecent = enabled.filter((item) => !recentThree.includes(item.id));
  const withoutImmediateRepeat = enabled.filter((item) => item.id !== recentTemplateIds[0]);
  const candidates = withoutRecent.length ? withoutRecent : withoutImmediateRepeat.length ? withoutImmediateRepeat : enabled;
  if (!candidates.length) throw new Error("사용 가능한 미션 템플릿이 없습니다.");
  const totalWeight = candidates.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return candidates[0];
  let cursor = random() * totalWeight;
  for (const item of candidates) {
    cursor -= Math.max(0, item.weight);
    if (cursor < 0) return item;
  }
  return candidates.at(-1)!;
}

export const TEST_MISSION_CATEGORIES = ["video", "photo", "text", "audio", "emotion"] as const;
export type TestMissionCategory = typeof TEST_MISSION_CATEGORIES[number];

export function chooseTestMissionTemplate(
  category: TestMissionCategory | null,
  templateId: string | null,
  random = Math.random,
): MissionTemplate {
  const enabled = MISSION_TEMPLATES.filter((item) => item.enabled && TEST_MISSION_CATEGORIES.includes(item.category as TestMissionCategory));
  if (templateId) {
    const selected = enabled.find((item) => item.id === templateId && (!category || item.category === category));
    if (!selected) throw new Error("선택한 테스트 미션을 사용할 수 없습니다.");
    return selected;
  }
  const categories = category ? [category] : TEST_MISSION_CATEGORIES.filter((item) => enabled.some((template) => template.category === item));
  const selectedCategory = categories[Math.min(categories.length - 1, Math.floor(random() * categories.length))];
  const candidates = enabled.filter((item) => item.category === selectedCategory);
  const selected = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  if (!selected) throw new Error("사용 가능한 테스트 미션이 없습니다.");
  return selected;
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

export function seoulDayBounds(at: Date): { start: Date; end: Date } {
  const local = DateTime.fromJSDate(at, { zone: "utc" }).setZone("Asia/Seoul");
  return {
    start: local.startOf("day").toUTC().toJSDate(),
    end: local.endOf("day").plus({ milliseconds: 1 }).toUTC().toJSDate(),
  };
}
