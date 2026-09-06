// Itinerary fingerprinting — dedup a Védett Route Orchestrator több
// stratégiai lekérdezéséből visszakapott, gyakran átfedő útvonalak között.
//
// A fingerprint STABIL és DETERMINISZTIKUS: az indulási idő percre kerekítve
// + az összes tranzit lábon a mód+vonalnév+honnan+hova sorozata. Két
// itinerary, amelyiknek megegyezik a fingerprint-je, funkcionálisan
// ugyanazt az utat jelenti — még ha két különböző MOTIS-hívásból is jött.

import type { Journey } from "./types.ts";

export function computeJourneyFingerprint(journey: Journey): string {
  const roundedDeparture = journey.departureTime.slice(0, 16); // yyyy-mm-ddThh:mm percre
  const transitLegsKey = journey.legs
    .filter((leg) => leg.mode === "TRANSIT")
    .map((leg) => [leg.transitMode ?? "TRANSIT", leg.routeShortName ?? "", leg.fromName, leg.toName].join("|"))
    .join(">>");
  return `${roundedDeparture}::${transitLegsKey}`;
}

/** Az első előfordulást tartja meg minden fingerprint-hez, sorrendhelyesen. */
export function deduplicateJourneys(journeys: Journey[]): Journey[] {
  const seen = new Set<string>();
  const result: Journey[] = [];
  for (const journey of journeys) {
    const fp = journey.fingerprint ?? computeJourneyFingerprint(journey);
    if (seen.has(fp)) continue;
    seen.add(fp);
    result.push({ ...journey, fingerprint: fp });
  }
  return result;
}
