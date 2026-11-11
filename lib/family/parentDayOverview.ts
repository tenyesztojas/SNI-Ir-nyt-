// Védett Család — szülői/gondviselői napi áttekintés gyermekenként (pure,
// tesztelhető). Ugyanazokat a szabályokat használja, mint a gyermek saját
// napi nézete (todayScheduleItems, nextScheduleItemId, resolveItemTravelState),
// így a két felület következetes.
//
// Elvek:
//   * Az állapot KIZÁRÓLAG a gyermek által rögzített eseményeken
//     (child_travel_statuses) alapul — nincs becslés, helymeghatározás vagy
//     járműpozíció.
//   * „Megérkezett” = a gyermek ezt jelezte; NEM „biztonságban van”.
//   * A még nem jelzett indulás/érkezés NEM vészhelyzet: semleges szöveg.
//   * Tegnapról nyitva maradt (le nem zárt) út: „nincs friss adat”, az utolsó
//     ismert jelzés megjelölésével — nem állítjuk, hogy most is úton van.
//   * Ha az adatok nem tölthetők be: „nincs friss adat”, sosem találgatunk.

import type { ChildScheduleItemView } from "./data.ts";
import { budapestLocalDay, nextScheduleItemId, todayScheduleItems } from "./todaySchedule.ts";
import { carriedOverTrips, previousDate, resolveItemTravelState, type TravelStatus, type TravelStatusRow } from "./travelStatus.ts";

export type ParentTravelKind = "not_started" | "departed" | "arrived" | "help_requested" | "unknown";

export interface ParentTravelView {
  kind: ParentTravelKind;
  /** Az utolsó ismert, a gyermek által rögzített állapot (unknown esetén is, ha volt). */
  lastKnown: TravelStatus | null;
  departedAt: string | null;
  arrivedAt: string | null;
  helpRequestedAt: string | null;
  /** Tegnap kezdett, le nem zárt út. */
  carriedOver: boolean;
}

export interface ParentDayItem {
  id: string;
  title: string;
  timeLocal: string;
  arrivalTimeLocal: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  isNext: boolean;
  travel: ParentTravelView;
}

export interface ParentCarriedTrip {
  scheduleItemId: string;
  travel: ParentTravelView;
}

export interface ParentLastEvent {
  kind: TravelStatus;
  at: string;
}

export interface ParentDayOverview {
  date: string;
  items: ParentDayItem[];
  nextItemId: string | null;
  carriedOver: ParentCarriedTrip[];
  /** Ma vagy a tegnapi, nyitott úton aktív segítségkérés. */
  helpActive: boolean;
  /** A ma/tegnap rögzített legutóbbi esemény (indulás, érkezés, segítségkérés). */
  lastEvent: ParentLastEvent | null;
  dataAvailable: boolean;
}

export const PARENT_TRAVEL_LABEL: Record<ParentTravelKind, string> = {
  not_started: "Még nem jelzett indulást",
  departed: "Elindult (a gyermek jelzése)",
  arrived: "Megérkezést jelzett",
  help_requested: "Segítséget kért",
  unknown: "Nincs friss adat",
};

export const PARENT_TRAVEL_HINT: Record<ParentTravelKind, string> = {
  not_started: "Ez önmagában nem jelent problémát: a gyermek még nem nyomta meg az indulás gombot.",
  departed: "Érkezést még nem jelzett. Ez nem helykövetés.",
  arrived: "A gyermek saját jelzése, nem ellenőrzött érkezés.",
  help_requested: "Ez nem segélyhívás. Szükség esetén vedd fel a kapcsolatot a gyermekkel; vészhelyzetben hívd a 112-t.",
  unknown: "Az állapot most nem ismert; csak a legutóbb rögzített jelzést tudjuk megmutatni.",
};

type RowLike = TravelStatusRow;

function viewFromRow(row: RowLike | null, carriedOver: boolean, dataAvailable: boolean): ParentTravelView {
  if (!dataAvailable) {
    return { kind: "unknown", lastKnown: null, departedAt: null, arrivedAt: null, helpRequestedAt: null, carriedOver: false };
  }
  if (!row) {
    return { kind: "not_started", lastKnown: null, departedAt: null, arrivedAt: null, helpRequestedAt: null, carriedOver: false };
  }
  const base = {
    lastKnown: row.status,
    departedAt: row.departed_at,
    arrivedAt: row.arrived_at,
    helpRequestedAt: row.help_requested_at,
    carriedOver,
  };
  // Tegnapi nyitott út: a segítségkérés kiemelt marad, minden más „nincs friss adat”.
  if (carriedOver && row.status !== "help_requested") return { kind: "unknown", ...base };
  return { kind: row.status, ...base };
}

function latestEvent(rows: RowLike[]): ParentLastEvent | null {
  let best: ParentLastEvent | null = null;
  for (const r of rows) {
    const candidates: Array<[TravelStatus, string | null]> = [
      ["departed", r.departed_at],
      ["arrived", r.arrived_at],
      ["help_requested", r.help_requested_at],
    ];
    for (const [kind, at] of candidates) {
      if (at && (!best || at > best.at)) best = { kind, at };
    }
  }
  return best;
}

export function buildParentDayOverview(input: {
  items: ChildScheduleItemView[];
  rows: RowLike[];
  now: Date;
  dataAvailable: boolean;
}): ParentDayOverview {
  const day = budapestLocalDay(input.now);
  const today = todayScheduleItems(input.items, day);
  const nextItemId = nextScheduleItemId(today, day.minutes);
  // Csak a mai és a tegnapi sorok számítanak (a régebbiek sosem „aktuálisak”).
  const prevDay = previousDate(day.date);
  const rows = input.dataAvailable ? input.rows.filter((r) => r.travel_date === day.date || r.travel_date === prevDay) : [];

  const items: ParentDayItem[] = today.map((item) => {
    const resolved = resolveItemTravelState(rows, item.id, day.date);
    const row = resolved.state
      ? rows.find((r) => r.schedule_item_id === item.id && r.travel_date === (resolved.carriedOver ? prevDay : day.date)) ?? null
      : null;
    return {
      id: item.id,
      title: item.title,
      timeLocal: item.timeLocal,
      arrivalTimeLocal: item.arrivalTimeLocal,
      originLabel: item.originLabel,
      destinationLabel: item.destinationLabel,
      isNext: item.id === nextItemId,
      travel: viewFromRow(row, resolved.carriedOver, input.dataAvailable),
    };
  });

  const carriedOver = carriedOverTrips(rows, day.date, new Set(today.map((i) => i.id))).map((r) => ({
    scheduleItemId: r.schedule_item_id,
    travel: viewFromRow(r, true, true),
  }));

  const helpActive =
    items.some((i) => i.travel.kind === "help_requested") || carriedOver.some((c) => c.travel.kind === "help_requested");

  return { date: day.date, items, nextItemId, carriedOver, helpActive, lastEvent: latestEvent(rows), dataAvailable: input.dataAvailable };
}
