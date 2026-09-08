// Sprint E — determinisztikus itinerary-választás egy MOTIS /api/v6/plan
// válaszból, pontpontra útvonaltervezéshez (pihenőponthoz menet, illetve
// az eredeti célhoz visszatérő reroute).
//
// FONTOS KÜLÖNBSÉG a fő útvonalkereséshez (orchestrator.ts
// searchVedettRoutes) képest: ott TÖBB, egymástól eltérő MOTIS stratégiát
// futtatunk párhuzamosan, Sensory Engine-nel rangsorolunk, és TÖBB
// alternatívát mutatunk a felhasználónak (a felhasználó választ). A
// "Pihenőre van szükségem" folyamatban ez nem cél — egyetlen, konkrét
// útvonalat kell adni (a pihenőponthoz, illetve onnan tovább), ezért itt
// EGYETLEN MOTIS lekérdezésből választjuk ki a legjobbat, teljesen
// determinisztikusan: legrövidebb teljes utazási idő, egyenlőség esetén
// kevesebb átszállás, majd (ha még mindig egyenlő) a korábbi indulási idő
// — SOSEM véletlenszerű, SOSEM LLM.
//
// Üres itinerary lista esetén null-t ad vissza — a hívó (API route) ekkor
// REST_POINT_NO_ROUTE hibát jelez (lásd errorMapping.ts fejléce).

import type { MotisItinerary } from "../motisTypes.ts";

export function pickBestItinerary(itineraries: MotisItinerary[]): MotisItinerary | null {
  if (itineraries.length === 0) return null;

  return [...itineraries].sort((a, b) => {
    if (a.duration !== b.duration) return a.duration - b.duration;
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    const aStart = new Date(a.startTime).getTime();
    const bStart = new Date(b.startTime).getTime();
    if (Number.isFinite(aStart) && Number.isFinite(bStart) && aStart !== bStart) return aStart - bStart;
    return 0;
  })[0];
}
