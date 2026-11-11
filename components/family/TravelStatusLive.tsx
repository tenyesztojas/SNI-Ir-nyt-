"use client";

// Szülői oldali élő frissítés: EGY lekérdezés az összes látható gyermekre,
// 45 mp-enként, csak látható lapon; visszatéréskor azonnal. Hiba esetén az
// utolsó ismert állapot marad, és jelezzük, hogy a frissítés sikertelen.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useVisibleTick } from "@/lib/hooks/useVisibleTick";
import type { TravelStatusWithTitle } from "@/lib/family/travelStatusData";
import type { TravelStatusRow } from "@/lib/family/travelStatus";

export const TRAVEL_POLL_MS = 45_000;

type Live = {
  statuses: Record<string, TravelStatusWithTitle>;
  /** Mai és tegnapi sorok (napi áttekintéshez); null: még nincs élő adat. */
  rows: TravelStatusRow[] | null;
  failed: boolean;
  checkedAt: string | null;
};
const TravelLiveContext = createContext<Live | null>(null);

export function useTravelLive(): Live | null {
  return useContext(TravelLiveContext);
}

export default function TravelStatusLive({
  childIds,
  initial,
  children,
}: {
  childIds: string[];
  initial: Record<string, TravelStatusWithTitle>;
  children: ReactNode;
}) {
  const [live, setLive] = useState<Live>({ statuses: initial, rows: null, failed: false, checkedAt: null });
  const query = childIds.join(",");

  const poll = useCallback(() => {
    if (!query) return;
    fetch(`/api/family/travel-status?children=${encodeURIComponent(query)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { ok?: boolean; statuses?: Record<string, TravelStatusWithTitle>; rows?: TravelStatusRow[] } | null) => {
        if (json?.ok && json.statuses && typeof json.statuses === "object") {
          setLive({
            statuses: json.statuses,
            rows: Array.isArray(json.rows) ? json.rows : null,
            failed: false,
            checkedAt: new Date().toISOString(),
          });
        } else {
          setLive((prev) => ({ ...prev, failed: true }));
        }
      })
      .catch(() => setLive((prev) => ({ ...prev, failed: true })));
  }, [query]);

  useVisibleTick(poll, () => TRAVEL_POLL_MS, { immediate: false });

  return <TravelLiveContext.Provider value={live}>{children}</TravelLiveContext.Provider>;
}
