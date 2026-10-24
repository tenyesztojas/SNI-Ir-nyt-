// Védett Napom — gyermekbarát utazási kártya adatai (pure, tesztelhető).
// KIZÁRÓLAG a meglévő napirendi mezőkből; hiányzó adatnál null — a felület
// ilyenkor „Nincs megadva” szöveget mutat, kitalált értéket soha.

import type { ChildScheduleItemView } from "@/lib/family/data";
import { buildScheduleRouteHref } from "./scheduleLocation.ts";
import { timeToMinutes } from "./todaySchedule.ts";

export type TravelCard = {
  program: string;
  from: string | null;
  to: string | null;
  departTime: string | null;
  arriveTime: string | null;
  // A meglévő Védett Útvonal mélylink; null, ha nincs érvényes célkoordináta.
  routeHref: string | null;
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};
const hhmm = (v: string | null | undefined) => (timeToMinutes(v) === null ? null : (v as string).slice(0, 5));

export function buildTravelCard(item: ChildScheduleItemView): TravelCard {
  return {
    program: item.title.trim(),
    from: clean(item.originLabel),
    to: clean(item.destinationLabel),
    departTime: hhmm(item.timeLocal),
    arriveTime: hhmm(item.arrivalTimeLocal),
    routeHref: buildScheduleRouteHref(item),
  };
}

export const TRAVEL_CARD_ROWS: ReadonlyArray<{ key: "program" | "from" | "to" | "departTime" | "arriveTime"; label: string }> = [
  { key: "program", label: "Milyen programra megyek?" },
  { key: "from", label: "Honnan indulok?" },
  { key: "to", label: "Hová megyek?" },
  { key: "departTime", label: "Mikor indulok?" },
  { key: "arriveTime", label: "Mikorra kell megérkeznem?" },
];

export const TRAVEL_CARD_MISSING = "Nincs megadva";
