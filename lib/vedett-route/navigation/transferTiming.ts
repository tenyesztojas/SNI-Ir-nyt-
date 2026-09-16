// NAVIGATION — CURRENT/NEXT TRANSIT TRANSFER TIMING (Sprint 7.1, Section G).
//
// Pure, determinisztikus resolver. Kizárólag a MÁR MEGLÉVŐ, normalizált
// JourneyLeg mezőket olvassa (departureTime/arrivalTime/scheduled*/realtime/
// cancelled — lib/vedett-route/orchestrator.ts mapLeg()) — nincs saját
// menetrend-számítás, nincs kézi delayMinutes-alkalmazás (a departureTime/
// arrivalTime MÁR a tényleges, realtime-korrigált normalizált idő, HA a
// MOTIS realtime-ot adott — lásd realtimeInfo.ts audit-összefoglalója).

export interface TransferTimingLegLike {
  mode: "WALK" | "TRANSIT" | "RENTAL";
  routeShortName?: string;
  routeLongName?: string;
  arrivalTime?: string;
  scheduledArrivalTime?: string;
  departureTime?: string;
  scheduledDepartureTime?: string;
  realtime: boolean;
  cancelled?: boolean;
}

export interface TransferTimeInfo {
  timeIso: string;
  /** true KIZÁRÓLAG akkor, ha a leg realtime===true ÉS a tényleges (nem csak menetrendi) idő állt rendelkezésre. */
  isRealtime: boolean;
}

export interface NavigationTransferDeparture extends Omit<TransferTimeInfo, "timeIso"> {
  timeIso: string | null;
  routeLabel: string | null;
  cancelled: boolean;
}

export interface NavigationTransferTiming {
  /** Az AKTÍV TRANSIT leg érkezési ideje, HA az aktív leg valóban TRANSIT. */
  currentArrival: TransferTimeInfo | null;
  /** A KÖVETKEZŐ releváns TRANSIT leg indulási ideje, HA van ilyen leg. */
  nextDeparture: NavigationTransferDeparture | null;
}

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// item 3/4: a tényleges (departureTime/arrivalTime) mező elsőbbséget kap,
// és CSAK akkor jelöljük realtime-nak, ha a leg maga realtime===true — egy
// csak-scheduled leg sosem kap "realtime" jelölést, még akkor sem, ha
// egyébként megjeleníthető (item 4).
function resolveTimeInfo(actual: string | undefined, scheduled: string | undefined, realtime: boolean): TransferTimeInfo | null {
  if (isNonEmpty(actual)) {
    return { timeIso: actual, isRealtime: realtime === true };
  }
  if (isNonEmpty(scheduled)) {
    return { timeIso: scheduled, isRealtime: false };
  }
  return null;
}

export function resolveNavigationTransferTiming(
  legs: readonly TransferTimingLegLike[],
  activeLegIndex: number | null | undefined
): NavigationTransferTiming {
  if (activeLegIndex === null || activeLegIndex === undefined || !Number.isFinite(activeLegIndex)) {
    return { currentArrival: null, nextDeparture: null };
  }
  if (activeLegIndex < 0 || activeLegIndex >= legs.length) {
    return { currentArrival: null, nextDeparture: null };
  }

  const activeLeg = legs[activeLegIndex];
  const currentArrival =
    activeLeg.mode === "TRANSIT"
      ? resolveTimeInfo(activeLeg.arrivalTime, activeLeg.scheduledArrivalTime, activeLeg.realtime)
      : null;

  // item 6: a következő RELEVÁNS TRANSIT leg keresése — a köztes WALK/
  // RENTAL legek (pl. az átszállási gyaloglás) átugorhatók, mert a
  // Journey.legs szigorúan szekvenciális, elágazás nélküli sorozat: két
  // TRANSIT leg között legfeljebb egy WALK/RENTAL leg állhat (az átszállás
  // gyaloglása/kerékpáros szakasza), tehát "a következő TRANSIT leg"
  // domain-szinten egyértelmű, nincs találgatás arról, MELYIK jövőbeli
  // TRANSIT legre gondolunk.
  let nextTransitIndex = -1;
  for (let i = activeLegIndex + 1; i < legs.length; i += 1) {
    if (legs[i].mode === "TRANSIT") {
      nextTransitIndex = i;
      break;
    }
  }

  let nextDeparture: NavigationTransferDeparture | null = null;
  if (nextTransitIndex !== -1) {
    const nextLeg = legs[nextTransitIndex];
    const routeLabel = nextLeg.routeShortName ?? nextLeg.routeLongName ?? null;
    if (nextLeg.cancelled === true) {
      // item 28: cancelled next leg — SOSEM mutatunk (esetleg már érvénytelen)
      // indulási időt egy törölt járathoz, de a cancelled tényét jelezzük,
      // hogy a hívó ne hallgasson róla.
      nextDeparture = { timeIso: null, isRealtime: false, routeLabel, cancelled: true };
    } else {
      const departureInfo = resolveTimeInfo(nextLeg.departureTime, nextLeg.scheduledDepartureTime, nextLeg.realtime);
      if (departureInfo) {
        nextDeparture = { ...departureInfo, routeLabel, cancelled: false };
      }
    }
  }

  return { currentArrival, nextDeparture };
}
