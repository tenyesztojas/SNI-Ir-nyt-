// Védett Napom — a gyermek MAI napirendje (pure, tesztelhető).
// Időzóna: Europe/Budapest. A hét napjai ISO szerint: 1 = hétfő … 7 = vasárnap.

import type { ChildScheduleItemView } from "@/lib/family/data";

export const FAMILY_TIME_ZONE = "Europe/Budapest";

export type LocalDay = { date: string; weekday: number; minutes: number };

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// A megadott pillanat magyarországi helyi dátuma (YYYY-MM-DD), hét napja és perce.
export function budapestLocalDay(now: Date): LocalDay {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FAMILY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// "HH:MM" vagy "HH:MM:SS" -> perc; érvénytelennél null.
export function timeToMinutes(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

export function isScheduledOn(item: ChildScheduleItemView, day: Pick<LocalDay, "date" | "weekday">): boolean {
  if (!item.isActive) return false;
  if (item.scheduleType === "one_time") return item.startDate === day.date;
  if (item.startDate && day.date < item.startDate) return false;
  if (item.endDate && day.date > item.endDate) return false;
  return (item.daysOfWeek ?? []).includes(day.weekday);
}

// Mai események időrendben (azonos időnél cím szerint).
export function todayScheduleItems(items: ChildScheduleItemView[], day: Pick<LocalDay, "date" | "weekday">): ChildScheduleItemView[] {
  return items
    .filter((i) => isScheduledOn(i, day))
    .sort(
      (a, b) =>
        (timeToMinutes(a.timeLocal) ?? 24 * 60) - (timeToMinutes(b.timeLocal) ?? 24 * 60) ||
        a.title.localeCompare(b.title, "hu")
    );
}

// A következő aktuális program: az első, amelyik még nem ért véget
// (érkezési idő, ennek hiányában a kezdés). Ha minden lezajlott: null.
export function nextScheduleItemId(sortedToday: ChildScheduleItemView[], nowMinutes: number): string | null {
  for (const item of sortedToday) {
    const end = timeToMinutes(item.arrivalTimeLocal) ?? timeToMinutes(item.timeLocal);
    if (end === null || end >= nowMinutes) return item.id;
  }
  return null;
}

// ---- Indulás előtti, alkalmazáson belüli figyelmeztetések ----
// Ablakok (perc indulásig): 15–11, 10–6, 5–1, 0 (indulás perce).
// Eseményenként egy pillanatban legfeljebb EGY figyelmeztetés.
export type DepartureAlertLevel = "15" | "10" | "5" | "now";
export type DepartureAlert = { itemId: string; level: DepartureAlertLevel; minutesLeft: number };

export function departureAlertLevel(minutesLeft: number): DepartureAlertLevel | null {
  if (!Number.isInteger(minutesLeft)) return null;
  if (minutesLeft === 0) return "now";
  if (minutesLeft >= 1 && minutesLeft <= 5) return "5";
  if (minutesLeft >= 6 && minutesLeft <= 10) return "10";
  if (minutesLeft >= 11 && minutesLeft <= 15) return "15";
  return null;
}

// Csak a MAI (budapesti), aktív, érvényes eseményekre; időrendben.
export function todayDepartureAlerts(items: ChildScheduleItemView[], now: Date): DepartureAlert[] {
  const day = budapestLocalDay(now);
  const alerts: DepartureAlert[] = [];
  for (const item of todayScheduleItems(items, day)) {
    const start = timeToMinutes(item.timeLocal);
    if (start === null) continue;
    const level = departureAlertLevel(start - day.minutes);
    if (level) alerts.push({ itemId: item.id, level, minutesLeft: start - day.minutes });
  }
  return alerts;
}
