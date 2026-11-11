"use client";

// Szülői/gondviselői napi áttekintés gyermekenként: a mai napirend, a
// következő program, programonként a gyermek által rögzített utazási jelzés,
// a tegnapról nyitva maradt út és a segítségkérés. Ugyanazokat a szabályokat
// használja, mint a gyermek saját nézete (lib/family/parentDayOverview.ts).
// Nem helykövetés; „megérkezett” nem jelenti, hogy a gyermek biztonságban van.

import { useState } from "react";
import { msUntilNextMinute, useVisibleTick } from "@/lib/hooks/useVisibleTick";
import type { ChildScheduleItemView } from "@/lib/family/data";
import type { TravelStatusRow } from "@/lib/family/travelStatus";
import { FAMILY_TIME_ZONE } from "@/lib/family/todaySchedule";
import {
  buildParentDayOverview,
  PARENT_TRAVEL_HINT,
  PARENT_TRAVEL_LABEL,
  type ParentTravelKind,
  type ParentTravelView,
} from "@/lib/family/parentDayOverview";
import { TRAVEL_STATUS_LABEL } from "@/lib/family/travelStatus";
import { useTravelLive } from "@/components/family/TravelStatusLive";

const KIND_STYLE: Record<ParentTravelKind, string> = {
  not_started: "border-gray-200 bg-white text-gray-700",
  departed: "border-blue-200 bg-blue-50 text-blue-900",
  arrived: "border-green-200 bg-green-50 text-green-900",
  help_requested: "border-red-600 bg-red-50 text-red-900",
  unknown: "border-amber-300 bg-amber-50 text-gray-900",
};

function clock(iso: string): string {
  return new Intl.DateTimeFormat("hu-HU", { timeZone: FAMILY_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function localDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: FAMILY_TIME_ZONE }).format(new Date(iso));
}
function when(iso: string, today: string): string {
  return localDate(iso) === today ? clock(iso) : `tegnap ${clock(iso)}`;
}
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function TravelLine({ travel, today }: { travel: ParentTravelView; today: string }) {
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-sm ${KIND_STYLE[travel.kind]}`}>
      <p className="font-semibold">{PARENT_TRAVEL_LABEL[travel.kind]}</p>
      <ul className="mt-0.5 space-y-0.5 text-xs">
        {travel.kind === "unknown" && travel.lastKnown && (
          <li>Utolsó ismert jelzés: {TRAVEL_STATUS_LABEL[travel.lastKnown]}</li>
        )}
        {travel.departedAt && <li>Indulást jelzett: {when(travel.departedAt, today)}</li>}
        {travel.helpRequestedAt && <li>Segítséget kért: {when(travel.helpRequestedAt, today)}</li>}
        {travel.arrivedAt && <li>Érkezést jelzett: {when(travel.arrivedAt, today)}</li>}
      </ul>
      <p className="mt-1 text-xs opacity-80">{PARENT_TRAVEL_HINT[travel.kind]}</p>
    </div>
  );
}

export default function ChildDayOverview({
  childId,
  childName,
  scheduleItems,
  initialRows,
  initialDataAvailable,
  nowIso,
}: {
  childId: string;
  childName: string;
  scheduleItems: ChildScheduleItemView[];
  initialRows: TravelStatusRow[];
  initialDataAvailable: boolean;
  nowIso: string;
}) {
  const [now, setNow] = useState(() => new Date(nowIso));
  useVisibleTick(() => setNow(new Date()), () => msUntilNextMinute(), { immediate: false });
  const live = useTravelLive();
  const rows = live?.rows ? live.rows.filter((r) => r.child_id === childId) : initialRows;
  const dataAvailable = live?.rows ? true : initialDataAvailable;
  const o = buildParentDayOverview({ items: scheduleItems, rows, now, dataAvailable });
  const titleOf = (id: string) => scheduleItems.find((i) => i.id === id)?.title ?? "Napirendi program";
  const headingId = `day-${childId}`;

  return (
    <section aria-labelledby={headingId} className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h4 id={headingId} className="text-sm font-semibold text-gray-800">
        {childName} mai napja
      </h4>

      {o.helpActive && (
        <div role="alert" className="mt-2 rounded-lg border-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-semibold">{childName} segítséget kért.</p>
          <p className="text-xs">{PARENT_TRAVEL_HINT.help_requested}</p>
        </div>
      )}

      {!o.dataAvailable && (
        <p className="mt-2 text-xs text-amber-800">Az utazási jelzéseket most nem sikerült betölteni; az állapot nem ismert.</p>
      )}
      {live?.failed && o.dataAvailable && (
        <p className="mt-2 text-xs text-amber-800">A frissítés most nem sikerült – a legutóbb betöltött állapot látható.</p>
      )}

      {o.carriedOver.map((c) => (
        <div key={`carried-${c.scheduleItemId}`} className="mt-2">
          <p className="text-xs font-semibold text-gray-700">Tegnap megkezdett, le nem zárt út: {titleOf(c.scheduleItemId)}</p>
          <TravelLine travel={c.travel} today={o.date} />
        </div>
      ))}

      {o.items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">Mára nincs napirendi program.</p>
      ) : (
        <ol className="mt-2 space-y-3">
          {o.items.map((item) => (
            <li key={item.id} className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-gray-900">
                  {item.title}
                  {item.isNext && (
                    <span className="ml-2 rounded-full bg-sni-brand-blue px-2 py-0.5 text-xs font-medium text-white">Következő</span>
                  )}
                </p>
                <p className="text-sm text-gray-700">
                  Indulás: {hhmm(item.timeLocal) ?? "nincs megadva"}
                  {item.arrivalTimeLocal && ` · érkezés: ${hhmm(item.arrivalTimeLocal)}`}
                </p>
              </div>
              {(item.originLabel || item.destinationLabel) && (
                <p className="text-xs text-gray-600">
                  {item.originLabel ?? "Indulási hely nincs megadva"} → {item.destinationLabel ?? "Úti cél nincs megadva"}
                </p>
              )}
              <TravelLine travel={item.travel} today={o.date} />
            </li>
          ))}
        </ol>
      )}

      {o.lastEvent && (
        <p className="mt-3 text-xs text-gray-600">
          Legutóbbi jelzés: {TRAVEL_STATUS_LABEL[o.lastEvent.kind]}, {when(o.lastEvent.at, o.date)}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500">
        A jelzéseket a gyermek maga adja; nem helymeghatározás, és nem jelenti, hogy a gyermek biztonságban van.
      </p>
    </section>
  );
}
