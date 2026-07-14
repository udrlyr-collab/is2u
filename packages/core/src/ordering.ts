type DateValue = Date | string | null | undefined;

function milliseconds(value: DateValue): number {
  if (!value) return 0;
  return (value instanceof Date ? value : new Date(value)).getTime();
}

export type MissionFeedOrderItem = {
  status: "scheduled" | "sent" | "completed" | "skipped" | "expired" | "cancelled";
  scheduledAt: DateValue;
  sentAt?: DateValue;
  expiresAt?: DateValue;
  updatedAt?: DateValue;
  memoryCreatedAt?: DateValue;
  memoryFirstPinnedAt?: DateValue;
};

export function missionDisplayAt(item: MissionFeedOrderItem): Date {
  const value = item.status === "completed"
    ? item.memoryFirstPinnedAt ?? item.memoryCreatedAt ?? item.sentAt ?? item.scheduledAt
    : item.status === "sent"
      ? item.sentAt ?? item.scheduledAt
      : item.status === "scheduled"
        ? item.scheduledAt
        : item.updatedAt ?? item.sentAt ?? item.scheduledAt;
  return new Date(value ?? 0);
}

export function missionFeedBucket(item: MissionFeedOrderItem, now = new Date()): number {
  if (item.status === "sent" && (!item.expiresAt || milliseconds(item.expiresAt) > now.getTime())) return 0;
  if (item.status === "scheduled") return 1;
  if (item.status === "completed") return 2;
  if (item.status === "skipped") return 3;
  return 4;
}

export function compareMissionFeed(a: MissionFeedOrderItem, b: MissionFeedOrderItem, now = new Date()): number {
  void now;
  return missionDisplayAt(b).getTime() - missionDisplayAt(a).getTime();
}

export type CalendarOrderItem = {
  status: "scheduled" | "active" | "completed" | "cancelled";
  startAt: DateValue;
  endAt: DateValue;
  updatedAt: DateValue;
  cancelledAt?: DateValue;
};

export const CALENDAR_GROUPS = ["active", "scheduled", "completed", "cancelled"] as const;
export type CalendarGroup = typeof CALENDAR_GROUPS[number];

export function calendarGroup(item: CalendarOrderItem): CalendarGroup {
  return item.status;
}

export function compareCalendarEvents(a: CalendarOrderItem, b: CalendarOrderItem): number {
  const groupDifference = CALENDAR_GROUPS.indexOf(calendarGroup(a)) - CALENDAR_GROUPS.indexOf(calendarGroup(b));
  if (groupDifference) return groupDifference;
  if (a.status === "active") return milliseconds(a.startAt) - milliseconds(b.startAt);
  if (a.status === "scheduled") return milliseconds(a.startAt) - milliseconds(b.startAt);
  if (a.status === "completed") return milliseconds(b.endAt) - milliseconds(a.endAt);
  return milliseconds(b.cancelledAt ?? b.updatedAt) - milliseconds(a.cancelledAt ?? a.updatedAt);
}

export type AppointmentView = "upcoming" | "past";

export function appointmentView(item: CalendarOrderItem, now = new Date()): AppointmentView {
  return milliseconds(item.endAt) >= now.getTime() ? "upcoming" : "past";
}

export function compareAppointmentEvents(a: CalendarOrderItem, b: CalendarOrderItem, view: AppointmentView): number {
  if (view === "upcoming") return milliseconds(b.startAt) - milliseconds(a.startAt);
  return milliseconds(b.endAt) - milliseconds(a.endAt);
}
