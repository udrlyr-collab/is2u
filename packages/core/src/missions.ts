import { DateTime, Interval } from "luxon";
import { MISSION_TEMPLATES, MISSION_TYPES, MISSION_TYPE_WEIGHTS, type MissionTemplate, type MissionType } from "./types";

export const MISSION_END_BUFFER_MINUTES = 15;
export const OPEN_SCHEDULED_MISSION_LIMIT_PER_USER = 2;

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

export function randomMissionIntervalMinutes(minMinutes: number, maxMinutes: number, random = Math.random): number {
  if (!Number.isInteger(minMinutes) || !Number.isInteger(maxMinutes) || minMinutes < 1 || minMinutes > maxMinutes) {
    throw new Error("미션 간격 범위가 올바르지 않습니다.");
  }
  return minMinutes + Math.floor(random() * (maxMinutes - minMinutes + 1));
}

export function nextRecurringMissionAt(
  baseline: Date,
  eventEndAt: Date,
  minMinutes: number,
  maxMinutes: number,
  random = Math.random,
  endBufferMinutes = MISSION_END_BUFFER_MINUTES,
): Date | null {
  const intervalMinutes = randomMissionIntervalMinutes(minMinutes, maxMinutes, random);
  const candidate = new Date(baseline.getTime() + intervalMinutes * 60_000);
  const lastAllowedAt = new Date(eventEndAt.getTime() - endBufferMinutes * 60_000);
  return candidate <= lastAllowedAt ? candidate : null;
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
  recentTemplateIds: readonly string[] = [],
): MissionTemplate {
  const enabled = MISSION_TEMPLATES.filter((item) => item.enabled && TEST_MISSION_CATEGORIES.includes(item.category as TestMissionCategory));
  if (templateId) {
    const selected = enabled.find((item) => item.id === templateId && (!category || item.category === category));
    if (!selected) throw new Error("선택한 확인용 미션을 사용할 수 없습니다.");
    return selected;
  }
  return chooseMissionTemplate(recentTemplateIds, category, random);
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

export type ScheduledRecipientCandidate = {
  id: string;
  delivered: number;
  open: number;
};

export function chooseScheduledRecipient(
  candidates: readonly ScheduledRecipientCandidate[],
  recentRecipientIds: readonly string[] = [],
  random = Math.random,
  openLimit = OPEN_SCHEDULED_MISSION_LIMIT_PER_USER,
): string | null {
  let eligible = candidates.filter((candidate) => candidate.open < openLimit);
  if (!eligible.length) return null;

  if (recentRecipientIds.length >= 2 && recentRecipientIds[0] === recentRecipientIds[1]) {
    const withoutThirdRepeat = eligible.filter((candidate) => candidate.id !== recentRecipientIds[0]);
    if (withoutThirdRepeat.length) eligible = withoutThirdRepeat;
  }

  const leastDelivered = Math.min(...eligible.map((candidate) => candidate.delivered));
  const balanced = eligible.filter((candidate) => candidate.delivered === leastDelivered);
  if (balanced.length) eligible = balanced;

  const leastOpen = Math.min(...eligible.map((candidate) => candidate.open));
  const leastBurdened = eligible.filter((candidate) => candidate.open === leastOpen);
  if (leastBurdened.length) eligible = leastBurdened;

  return eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))]?.id ?? null;
}

export function chooseScheduledMissionTemplate(
  options: {
    recentTemplateIds?: readonly string[];
    usedTemplateIdsForDate?: readonly string[];
    supportedCapabilities?: readonly string[];
  } = {},
  random = Math.random,
): MissionTemplate {
  const supported = options.supportedCapabilities ? new Set(options.supportedCapabilities) : null;
  const available = MISSION_TEMPLATES.filter((template) => template.enabled && (
    !supported || template.requiredCapabilities.every((capability) => supported.has(capability))
  ));
  if (!available.length) throw new Error("사용 가능한 미션 템플릿이 없습니다.");

  const usedForDate = new Set(options.usedTemplateIdsForDate ?? []);
  const unusedForDate = available.filter((template) => !usedForDate.has(template.id));
  let pool = unusedForDate.length ? unusedForDate : available;
  const recent = options.recentTemplateIds ?? [];

  if (recent.length >= 2) {
    const first = available.find((template) => template.id === recent[0]);
    const second = available.find((template) => template.id === recent[1]);
    if (first && second && first.category === second.category) {
      const withoutThirdCategory = pool.filter((template) => template.category !== first.category);
      if (withoutThirdCategory.length) pool = withoutThirdCategory;
    }
  }

  const recentThree = new Set(recent.slice(0, 3));
  const withoutRecent = pool.filter((template) => !recentThree.has(template.id));
  if (withoutRecent.length) pool = withoutRecent;
  else {
    const withoutImmediateRepeat = pool.filter((template) => template.id !== recent[0]);
    if (withoutImmediateRepeat.length) pool = withoutImmediateRepeat;
  }

  const eligibleTypes = MISSION_TYPES.filter((type) => pool.some((template) => template.type === type));
  const totalTypeWeight = eligibleTypes.reduce((sum, type) => sum + Math.max(0, MISSION_TYPE_WEIGHTS[type]), 0);
  let typeCursor = random() * totalTypeWeight;
  let selectedType = eligibleTypes[0];
  for (const type of eligibleTypes) {
    typeCursor -= Math.max(0, MISSION_TYPE_WEIGHTS[type]);
    if (typeCursor < 0) { selectedType = type; break; }
  }

  const templates = pool.filter((template) => template.type === selectedType);
  const totalTemplateWeight = templates.reduce((sum, template) => sum + Math.max(0, template.weight), 0);
  if (totalTemplateWeight <= 0) return templates[0];
  let templateCursor = random() * totalTemplateWeight;
  for (const template of templates) {
    templateCursor -= Math.max(0, template.weight);
    if (templateCursor < 0) return template;
  }
  return templates.at(-1)!;
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
