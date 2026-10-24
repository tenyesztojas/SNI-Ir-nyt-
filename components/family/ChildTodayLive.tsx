"use client";

// Védett Napom — élő (percenként frissülő) gyermeknézet. EGYETLEN óra
// (useVisibleTick, perchatárra igazítva, rejtett lapon áll) hajtja a napi
// listát, a „Következő program” kiemelést és az indulási figyelmeztetéseket.
// Hydration: az első render a szerver által átadott `nowIso`-t használja.

import { useState } from "react";
import { MapPin, Navigation, Sun } from "lucide-react";
import { msUntilNextMinute, useVisibleTick } from "@/lib/hooks/useVisibleTick";
import type { FamilyChildView } from "@/lib/family/data";
import { TRAVEL_CARD_MISSING, TRAVEL_CARD_ROWS, buildTravelCard } from "@/lib/family/travelCard";
import DepartureAlerts from "@/components/family/DepartureAlerts";
import TravelStatusControls from "@/components/family/TravelStatusControls";
import { carriedOverTrips, resolveItemTravelState, type TravelStatusRow } from "@/lib/family/travelStatus";
import { FAMILY_TIME_ZONE, budapestLocalDay, nextScheduleItemId, todayScheduleItems } from "@/lib/family/todaySchedule";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default function ChildTodayLive({
  child,
  nowIso,
  travelRows,
}: {
  child: FamilyChildView;
  nowIso: string;
  // A szerveren tárolt mai + tegnapi sorok; az aktuális napra a
  // resolveItemTravelState választ (éjfélkor is helyesen).
  travelRows: TravelStatusRow[];
}) {
  const [now, setNow] = useState(() => new Date(nowIso));
  useVisibleTick(() => setNow(new Date()), () => msUntilNextMinute(), { immediate: false });
  const day = budapestLocalDay(now);
  const items = todayScheduleItems(child.scheduleItems, day);
  const nextId = nextScheduleItemId(items, day.minutes);
  const carried = carriedOverTrips(travelRows, day.date, new Set(items.map((i) => i.id)));
  const dateLabel = new Intl.DateTimeFormat("hu-HU", {
    timeZone: FAMILY_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <header className="flex items-center gap-3">
        <Sun className="text-amber-500" size={36} aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Védett Napom</h1>
          <p className="text-lg text-gray-700">
            Szia, {child.firstName}! Ma {dateLabel} van.
          </p>
        </div>
      </header>

      <DepartureAlerts items={child.scheduleItems} now={now} />

      {carried.length > 0 && (
        <section className="mt-6 space-y-3" aria-label="Tegnap megkezdett utazás">
          {carried.map((row) => {
            const item = child.scheduleItems.find((i) => i.id === row.schedule_item_id);
            const travel = resolveItemTravelState(travelRows, row.schedule_item_id, day.date);
            return (
              <div key={`${row.schedule_item_id}|${row.travel_date}`} className="rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-soft">
                <p className="text-sm font-semibold text-amber-800">Tegnap megkezdett utazás</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{item?.title ?? "Napirendi program"}</p>
                <TravelStatusControls
                  key={`${row.schedule_item_id}|${row.travel_date}|carry`}
                  scheduleItemId={row.schedule_item_id}
                  initialState={travel.state}
                  carriedOver
                />
              </div>
            );
          })}
        </section>
      )}

      {items.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-white p-6 text-lg text-gray-700 shadow-soft">
          Mára nincs betervezett programod.
        </p>
      ) : (
        <ol className="mt-8 space-y-4" aria-label="Mai programjaim">
          {items.map((item) => {
            const isNext = item.id === nextId;
            const card = buildTravelCard(item);
            const travel = resolveItemTravelState(travelRows, item.id, day.date);
            const routeHref = card.routeHref;
            return (
              <li
                key={item.id}
                aria-current={isNext ? "true" : undefined}
                className={`rounded-2xl bg-white p-5 shadow-soft ${isNext ? "border-2 border-sni-brand-blue" : "border border-gray-100"}`}
              >
                {isNext && (
                  <p className="mb-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-sni-brand-blue">
                    Következő program
                  </p>
                )}
                {card.routeHref ? (
                  // Utazási kártya: csak a szülő által megadott napirendi adatok.
                  <dl className={`rounded-xl p-4 ${isNext ? "bg-blue-50" : "bg-slate-50"}`} aria-label="Utazási kártya">
                    {TRAVEL_CARD_ROWS.map((row) => {
                      const value = card[row.key];
                      return (
                        <div key={row.key} className="py-1.5">
                          <dt className="text-sm font-medium text-gray-600">{row.label}</dt>
                          <dd className={value ? "text-xl font-semibold text-gray-900" : "text-base italic text-gray-500"}>
                            {value ?? TRAVEL_CARD_MISSING}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums text-gray-900">
                      {hhmm(item.timeLocal)}
                      {item.arrivalTimeLocal && (
                        <span className="text-base font-normal text-gray-600"> · érkezés {hhmm(item.arrivalTimeLocal)}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{item.title}</p>
                    {item.description && <p className="mt-1 text-base text-gray-700">{item.description}</p>}
                    {item.destinationLabel && (
                      <p className="mt-2 flex items-center gap-2 text-base text-gray-700">
                        <MapPin size={18} aria-hidden="true" />
                        {item.destinationLabel}
                      </p>
                    )}
                  </>
                )}
                {routeHref && (
                  <a
                    href={routeHref}
                    className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-sni-brand-blue px-4 text-lg font-semibold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                  >
                    <Navigation size={22} aria-hidden="true" />
                    Útvonal megtervezése
                  </a>
                )}
                <TravelStatusControls
                  key={`${item.id}|${day.date}`}
                  scheduleItemId={item.id}
                  initialState={travel.state}
                  carriedOver={travel.carriedOver}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
