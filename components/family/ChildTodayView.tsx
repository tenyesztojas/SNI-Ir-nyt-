// Védett Napom — gyermekbarát, CSAK OLVASHATÓ kezdőképernyő az aktív
// gyermekfióknak. Szerverkomponens: nincs szerkesztés, törlés vagy
// családkezelés; a hozzáférést a /csalad oldal (getLinkedChildSelfView) dönti el.

import { MapPin, Navigation, Sun } from "lucide-react";
import type { FamilyChildView } from "@/lib/family/data";
import { buildScheduleRouteHref } from "@/lib/family/scheduleLocation";
import { FAMILY_TIME_ZONE, budapestLocalDay, nextScheduleItemId, todayScheduleItems } from "@/lib/family/todaySchedule";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default function ChildTodayView({ child, now = new Date() }: { child: FamilyChildView; now?: Date }) {
  const day = budapestLocalDay(now);
  const items = todayScheduleItems(child.scheduleItems, day);
  const nextId = nextScheduleItemId(items, day.minutes);
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

      {items.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-white p-6 text-lg text-gray-700 shadow-soft">
          Mára nincs betervezett programod.
        </p>
      ) : (
        <ol className="mt-8 space-y-4" aria-label="Mai programjaim">
          {items.map((item) => {
            const isNext = item.id === nextId;
            const routeHref = buildScheduleRouteHref(item);
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
                {routeHref && (
                  <a
                    href={routeHref}
                    className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-sni-brand-blue px-4 text-lg font-semibold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                  >
                    <Navigation size={22} aria-hidden="true" />
                    Útvonal megtervezése
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
