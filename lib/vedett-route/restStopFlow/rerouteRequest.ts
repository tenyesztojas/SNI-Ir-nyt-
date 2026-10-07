// Sprint E — a rerouting-lánc PURE (hálózat nélküli) request-építő része.
//
// A Sprint E Preparation Gate itt készítette elő a jövőbeli, "eredeti
// célhoz visszatérő" rerouting lánc paraméter-építését
// (buildRerouteToOriginalDestinationRequest), de SZÁNDÉKOSAN nem hívta meg
// a fetchMotisPlan()-t. A Sprint E teljes implementációja ezt EVOLVÁLTA:
// hozzáadta a testvér-függvényt, buildRouteToRestPointRequest()-et (a
// pihenőponthoz vezető, ODAFELÉ tartó útvonal paramétereihez), és mindkettőt
// TÉNYLEGESEN bekötötte:
//
//   current GPS / pihenőpont koordináta
//     -> Next.js szerver
//        -> app/api/vedett-route/rest-stops/route-to-rest-point/route.ts
//           (buildRouteToRestPointRequest)
//        -> app/api/vedett-route/rest-stops/resume/route.ts
//           (buildRerouteToOriginalDestinationRequest)
//     -> lib/vedett-route/motisClient.ts fetchMotisPlan()
//     -> HTTPS route service (VPS, lásd VPS_STAGING_INTEGRATION_GATE.md)
//     -> MOTIS realtime (/api/v6/plan)
//
// Ez a fájl MAGA továbbra sem hívja meg a fetchMotisPlan()-t — csak a
// PARAMÉTEREKET építi fel, pontosan a MOTIS hivatalos, dokumentált
// /api/v6/plan mezőnevei szerint (lásd motisTypes.ts MotisPlanParams) —
// ez marad a hálózat nélküli, tisztán unit-tesztelhető réteg.

import type { MotisPlanParams } from "../motisTypes.ts";
import type { JourneySearchRequest, PersonalizationWeights } from "../types.ts";
import type { OriginalDestination } from "./types.ts";
import type { RestPoint } from "../../rest-points/types.ts";

export interface RerouteFromPoint {
  lat: number;
  lon: number;
}

// departAt opcionális — ha nincs megadva, a hívás időpontját ("most")
// használja. Sprint E-ben ez mindig a tényleges "most" (a felhasználó
// éppen ekkor kéri az újratervezést a pihenőponttól) — ez a paraméter
// tesztelhetőség miatt van kiemelve (determinisztikus unit tesztekhez fix
// időpont adható át).
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

// Az ODAFELÉ (aktuális pozíció -> kiválasztott pihenőpont) útvonal
// paraméterei — ugyanaz a felépítés, mint a rerouténál, csak a cél a
// pihenőpont koordinátája, nem az originalDestination. A RestPoint
// "latitude"/"longitude" mezőnevét (lásd lib/rest-points/types.ts)
// szándékosan itt fordítjuk át a MOTIS "lat,lon" string konvenciójára, egy
// helyen — hogy a hívó oldalon (API route) ne kelljen ezzel foglalkozni.
export function buildRouteToRestPointRequest(
  from: RerouteFromPoint,
  restPoint: Pick<RestPoint, "latitude" | "longitude">,
  departAt?: string,
  numItineraries = 4
): MotisPlanParams {
  return {
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${restPoint.latitude},${restPoint.longitude}`,
    time: departAt ?? new Date().toISOString(),
    numItineraries,
  };
}

// ROUTING CONTEXT INTEGRITY (2026-10-07) — egy MÁR elindított navigáció
// újratervezése (automatikus off-route reroute, pihenő utáni folytatás) nem
// lazíthatja fel az eredeti routing-feltételeket. Ha a kliens átadja a
// routingContext-et, a /resume végpont a normál kereséssel AZONOS
// orchestratoron (searchVedettRoutes) tervez — így a lépcsőmentes szűrés,
// a Bubi/propulsion MOTIS-paraméterek és a személyre szabott rangsorolás
// pontosan ugyanaz, mint az eredeti keresésnél; nincs duplikált logika.
// timeMode: MINDIG DEPART_AT a továbbutazás időpontjától (egy régi
// ARRIVE_BY határidő itt értelmetlen) — a Live Alternative döntésével egyezően.
export interface RerouteRoutingContext {
  stepFreeRequired: boolean;
  molBubiEnabled: boolean;
  bikePropulsion?: "ANY" | "HUMAN" | "ELECTRIC_ASSIST";
  weights?: Partial<PersonalizationWeights>;
}

export function buildConstrainedRerouteSearchRequest(
  from: RerouteFromPoint,
  originalDestination: OriginalDestination,
  routingContext: RerouteRoutingContext,
  departAt: string | undefined,
  nowMs: number
): { request: JourneySearchRequest; weights: Partial<PersonalizationWeights> | undefined } {
  const requestedMs = departAt ? Date.parse(departAt) : NaN;
  // Múltbeli / hiányzó időpont -> most (dinamikus továbbutazási idő).
  const departMs = Number.isFinite(requestedMs) && requestedMs > nowMs ? requestedMs : nowMs;
  const molBubiEnabled = routingContext.molBubiEnabled === true;
  return {
    request: {
      from: { name: "Jelenlegi hely", lat: from.lat, lon: from.lon },
      to: { name: originalDestination.name, lat: originalDestination.lat, lon: originalDestination.lon },
      departAt: new Date(departMs).toISOString(),
      timeMode: "DEPART_AT",
      stepFreeRequired: routingContext.stepFreeRequired === true,
      molBubiEnabled,
      bikePropulsion: molBubiEnabled ? routingContext.bikePropulsion ?? "ANY" : "ANY",
    },
    weights: routingContext.weights,
  };
}
