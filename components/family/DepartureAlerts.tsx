"use client";

// Védett Napom — indulás előtti figyelmeztetések a nyitott oldalon.
// Percenként (a következő perchatárra igazítva) számol újra; rejtett
// lapon nem ütemez, visszatéréskor azonnal frissít; unmountkor leáll.
// Nincs push, nincs hálózati hívás, nincs logolás.

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import type { ChildScheduleItemView } from "@/lib/family/data";
import { buildScheduleRouteHref } from "@/lib/family/scheduleLocation";
import { todayDepartureAlerts, type DepartureAlert } from "@/lib/family/todaySchedule";

function alertText(a: DepartureAlert): string {
  return a.level === "now" ? "Most kell indulnod!" : `${a.minutesLeft} perc múlva indulás`;
}

export default function DepartureAlerts({ items }: { items: ChildScheduleItemView[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      setNow(new Date());
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!now) return null;
  const alerts = todayDepartureAlerts(items, now);
  if (alerts.length === 0) return null;
  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <section className="mt-6 space-y-3" aria-live="polite" aria-label="Indulási figyelmeztetések">
      {alerts.map((a) => {
        const item = byId.get(a.itemId);
        if (!item) return null;
        const routeHref = buildScheduleRouteHref(item);
        const urgent = a.level === "now" || a.level === "5";
        return (
          <div
            key={a.itemId}
            role="status"
            className={`rounded-2xl border-2 p-4 ${urgent ? "border-orange-500 bg-orange-50" : "border-amber-300 bg-amber-50"}`}
          >
            <p className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <BellRing size={24} aria-hidden="true" />
              {alertText(a)}
            </p>
            <p className="mt-1 text-lg text-gray-800">{item.title}</p>
            {routeHref && (
              <a
                href={routeHref}
                className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-xl bg-sni-brand-blue px-4 text-lg font-semibold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              >
                Útvonal megtervezése
              </a>
            )}
          </div>
        );
      })}
    </section>
  );
}
