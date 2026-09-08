// Sprint E Preparation Gate — a jövőbeli rerouting-lánc PURE (hálózat
// nélküli) request-építő része.
//
// TERVEZETT LÁNC (Sprint E-ben kerül ténylegesen bekötésre, EBBEN A
// GATE-BEN NEM):
//
//   current GPS / pihenőpont koordináta
//     -> Next.js szerver (ez a modul: buildRerouteToOriginalDestinationRequest)
//     -> lib/vedett-route/motisClient.ts fetchMotisPlan()
//     -> HTTPS route service (VPS, lásd VPS_STAGING_INTEGRATION_GATE.md)
//     -> MOTIS realtime (/api/v6/plan)
//     -> eredmény: új Journey az EREDETI (originalDestination) célig
//
// EZ A FÁJL SZÁNDÉKOSAN NEM HÍVJA MEG a fetchMotisPlan()-t — csak a
// PARAMÉTEREKET építi fel, pontosan a MOTIS hivatalos, dokumentált
// /api/v6/plan mezőnevei szerint (lásd motisTypes.ts MotisPlanParams),
// hogy amikor a Sprint E ténylegesen beköti, ne kelljen új
// paraméter-leképezést írni — csak meg kell hívni a már itt elkészült
// buildRerouteToOriginalDestinationRequest()-et, és átadni a
// fetchMotisPlan()-nek.

import type { MotisPlanParams } from "../motisTypes.ts";
import type { OriginalDestination } from "./types.ts";

export interface RerouteFromPoint {
  lat: number;
  lon: number;
}

// departAt opcionális — ha nincs megadva, a hívás időpontját ("most") 
// használja. Sprint E-ben ez mindig a tényleges "most" lesz (a
// felhasználó éppen ekkor kéri az újratervezést a pihenőponttól) — ez a
// paraméter tesztelhetőség miatt van kiemelve (determinisztikus unit
// tesztekhez fix időpont adható át).
export function buildRerouteToOriginalDestinationRequest(
  from: RerouteFromPoint,
  originalDestination: OriginalDestination,
  departAt?: string,
  numItineraries = 4
): MotisPlanParams {
  return {
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${originalDestination.lat},${originalDestination.lon}`,
    time: departAt ?? new Date().toISOString(),
    numItineraries,
  };
}
