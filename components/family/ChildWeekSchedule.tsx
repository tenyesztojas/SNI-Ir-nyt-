"use client";

// Védett Család — gyermek napirendje napi / heti nézetben (csak olvasás).
// Az adatok a szerveroldali, jogosultság-ellenőrzött getMyFamilies()-ből
// jönnek (RLS); ez a komponens nem kér le és nem módosít semmit.

import { useMemo, useState } from "react";
import type { ChildScheduleItemView } from "@/lib/family/data";
import { budapestLocalDay } from "@/lib/family/todaySchedule";
import {
  WEEKDAY_NAMES_HU,
  buildDaySchedule,
  buildWeekSchedule,
  formatShortDateHu,
  type ScheduleDay,
} from "@/lib/family/scheduleWeek";

type ViewMode = "day" | "week";

function ItemLine({ item }: { item: ChildScheduleItemView }) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
      <p className="font-semibold text-gray-900">
        <span className="tabular-nums">{item.timeLocal.slice(0, 5)}</span> · {item.title}
      </p>
      {item.arrivalTimeLocal && (
        <p className="text-gray-600">Érkezés legkésőbb: {item.arrivalTimeLocal.slice(0, 5)}</p>
      )}
      {(item.originLabel || item.destinationLabel) && (
        <p className="text-gray-600">
          {item.originLabel ?? "Kiindulás nincs megadva"} → {item.destinationLabel ?? "Cél nincs megadva"}
        </p>
      )}
    </li>
  );
}

function DayBlock({ day, headingLevel }: { day: ScheduleDay; headingLevel: "h5" | "h6" }) {
  const Heading = headingLevel;
  return (
    <section aria-label={`${WEEKDAY_NAMES_HU[day.weekday]}, ${formatShortDateHu(day.date)}`}>
      <Heading className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        {WEEKDAY_NAMES_HU[day.weekday]} <span className="font-normal text-gray-500">{formatShortDateHu(day.date)}</span>
        {day.isToday && (
          <span className="rounded-full bg-sni-brand-blue/10 px-2 py-0.5 text-xs font-semibold text-sni-brand-blue">
            ma
          </span>
        )}
      </Heading>
      {day.items.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">Nincs program.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2">
          {day.items.map((item) => (
            <ItemLine key={`${day.date}-${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ChildWeekSchedule({
  childName,
  items,
}: {
  childName: string;
  items: ChildScheduleItemView[];
}) {
  const [mode, setMode] = useState<ViewMode>("day");
  // Kliensen, a megnyitás pillanatában számolt budapesti nap (a szekció
  // csak kattintásra nyílik, így nincs SSR/hidratálási eltérés).
  const today = useMemo(() => budapestLocalDay(new Date()), []);
  const day = useMemo(() => buildDaySchedule(items, today), [items, today]);
  const week = useMemo(() => buildWeekSchedule(items, today), [items, today]);
  const weekTotal = week.reduce((n, d) => n + d.items.length, 0);

  const toggleClass = (active: boolean) =>
    `min-h-[44px] flex-1 rounded-xl px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-blue ${
      active ? "bg-sni-brand-blue text-white" : "bg-white text-gray-700 border border-gray-200"
    }`;

  return (
    <div className="mt-3 rounded-2xl bg-gray-50 p-3">
      <div role="group" aria-label={`${childName} napirendjének nézete`} className="flex gap-2">
        <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")} className={toggleClass(mode === "day")}>
          Mai nap
        </button>
        <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")} className={toggleClass(mode === "week")}>
          Ez a hét
        </button>
      </div>

      <div className="mt-3" aria-live="polite">
        {mode === "day" ? (
          day.items.length === 0 ? (
            <p className="text-sm text-gray-600">Ma nincs {childName} napirendjében program.</p>
          ) : (
            <DayBlock day={day} headingLevel="h5" />
          )
        ) : weekTotal === 0 ? (
          <p className="text-sm text-gray-600">Ezen a héten nincs {childName} napirendjében program.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {week.map((d) => (
              <DayBlock key={d.date} day={d} headingLevel="h5" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
