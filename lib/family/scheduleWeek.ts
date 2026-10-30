// Védett Család — gyermekenkénti napi/heti napirend-nézet (tiszta függvények).
// Az ismétlődés-szabály EGY helyen van: todaySchedule.ts isScheduledOn();
// ez a modul csak a hét napjaira vetíti és rendezi az elemeket.
// Időzóna: a "ma" a hívó által adott budapesti nap (budapestLocalDay()).

import type { ChildScheduleItemView } from "@/lib/family/data";
import { todayScheduleItems, type LocalDay } from "./todaySchedule.ts";

export const WEEKDAY_NAMES_HU: Record<number, string> = {
  1: "Hétfő",
  2: "Kedd",
  3: "Szerda",
  4: "Csütörtök",
  5: "Péntek",
  6: "Szombat",
  7: "Vasárnap",
};

export type ScheduleDay = {
  date: string; // YYYY-MM-DD (budapesti naptári nap)
  weekday: number; // ISO: 1 = hétfő … 7 = vasárnap
  isToday: boolean;
  items: ChildScheduleItemView[];
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Naptári nap eltolása; csak dátummal számol (UTC-ben), így nincs DST-hatás.
export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error("invalid_date");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

// Az adott nap hetének hétfőtől vasárnapig tartó napjai.
export function weekOf(today: Pick<LocalDay, "date" | "weekday">): Array<{ date: string; weekday: number }> {
  if (!Number.isInteger(today.weekday) || today.weekday < 1 || today.weekday > 7) {
    throw new Error("invalid_weekday");
  }
  const monday = addDays(today.date, 1 - today.weekday);
  return Array.from({ length: 7 }, (_, i) => ({ date: addDays(monday, i), weekday: i + 1 }));
}

export function buildDaySchedule(
  items: ChildScheduleItemView[],
  today: Pick<LocalDay, "date" | "weekday">
): ScheduleDay {
  return { date: today.date, weekday: today.weekday, isToday: true, items: todayScheduleItems(items, today) };
}

export function buildWeekSchedule(
  items: ChildScheduleItemView[],
  today: Pick<LocalDay, "date" | "weekday">
): ScheduleDay[] {
  return weekOf(today).map((day) => ({
    ...day,
    isToday: day.date === today.date,
    items: todayScheduleItems(items, day),
  }));
}

// "2026-10-30" -> "okt. 30."
const MONTHS_HU = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
export function formatShortDateHu(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) return date;
  return `${MONTHS_HU[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}.`;
}
