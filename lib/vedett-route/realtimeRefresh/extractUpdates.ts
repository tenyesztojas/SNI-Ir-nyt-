// SPRINT 9 (DIRECT TRIP REALTIME LOOKUP, 2026-09-23) — KORÁBBI KÖR
// KORREKCIÓJA. A korábbi (Sprint 7.2) extractRealtimeUpdates() egy /plan
// válasz TÖBB, vegyes itinerary-jából kinyert NYERS legs-tömbben kereste a
// pontos tripId-egyezést. Mivel a realtime-refresh MOSTANTÓL tripId-nkénti
// GET /api/v6/trip hívásokat indít (lásd motisClient.ts fetchMotisTrip()),
// az extrakció bemenete is megváltozott: EGY /trip válasz = EGY fizikai
// trip TELJES, origin-to-destination szakasza (nem egy vegyes,
// több-itinerary legs-lista).
//
// KRITIKUS, ÉLŐ VPS-TESZTTEL BIZONYÍTOTT GOTCHA: a /trip válasz start/end
// ideje a TELJES fizikai trip span-je (pl. egy M2 szerelvény teljes
// Örs vezér tere -> Déli pályaudvar futása, 06:43-07:01Z), NEM a
// felhasználó SAJÁT boarding/alighting megállóján mért idő (pl. Kossuth
// Lajos tér -> Déli pályaudvar sub-leg, 06:57-07:01Z). A sub-leg
// realtime-idejét EZÉRT TILOS a /trip válasz saját from/to (a TELJES trip
// origin/destination) mezőiből venni — KIZÁRÓLAG a JourneyLeg SAJÁT
// fromStopId/toStopId alapján, a /trip válasz TELJES megálló-sorozatából
// (from + intermediateStops + to) kikeresett, PONTOSAN egyező stopId-jű
// bejegyzésekből szabad levezetni.
//
// Identitás- vagy adat-bizonytalanság (nincs trip a kért tripId-re, nincs
// egyező from/to stop a válasz megálló-sorozatában) MINDIG csendes no-op —
// SOHA nem közelítés/becslés, SOHA nem másik trip helyettesítése.
//
// computeDelayMinutes-t VÁLTOZATLANUL az orchestrator.ts-ből importálja
// (NEM duplikálja) — ugyanaz a bizonyított logika, mint eddig, egy
// szintetikus, a kivágott sub-leg határpontjaiból épített MotisLeg-en
// alkalmazva.

import { computeDelayMinutes } from "../orchestrator.ts";
import type { MotisItinerary, MotisLeg, MotisPlace } from "../motisTypes.ts";

export interface RealtimeRefreshIdentity {
  tripId: string;
  routeId?: string;
  // A felhasználó SAJÁT boarding/alighting megállója (JourneyLeg.fromStopId/
  // toStopId, lásd orchestrator.ts mapLeg()) — KIZÁRÓLAG ez határozza meg,
  // mely stop-bejegyzéseket kell kivágni a /trip válasz TELJES megálló-
  // sorozatából. Hiányuk esetén (nincs elég adat a biztonságos
  // sub-leg-kivágáshoz) a leg csendben kimarad a frissítésből — SOSEM
  // esünk vissza a teljes trip origin/destination idejére.
  fromStopId?: string;
  toStopId?: string;
}

export interface RealtimeLegUpdate {
  tripId: string;
  routeId?: string;
  departureTime?: string;
  scheduledDepartureTime?: string;
  arrivalTime?: string;
  scheduledArrivalTime?: string;
  realtime: boolean;
  delayMinutes?: number;
  cancelled?: boolean;
}

function matchesTripIdentity(leg: MotisLeg, identity: RealtimeRefreshIdentity): boolean {
  if (!leg.tripId || leg.tripId !== identity.tripId) return false;
  if (identity.routeId !== undefined && leg.routeId !== undefined && leg.routeId !== identity.routeId) {
    // Mindkét oldalon jelen van a routeId, de nem egyezik — ugyanaz a
    // tripId két különböző route alatt bizonytalan egyezés, ezért inkább
    // no-op (biztonságos, konzervatív döntés) — VÁLTOZATLAN Sprint 7.2 óta.
    return false;
  }
  return true;
}

function findStopById(stops: readonly MotisPlace[], stopId: string | undefined): MotisPlace | undefined {
  if (!stopId) return undefined;
  return stops.find((stop) => stop.stopId === stopId);
}

// EGYETLEN /trip válasz (egy tripId-hez tartozó, teljes fizikai trip) +
// EGYETLEN kért identitás -> legfeljebb egy RealtimeLegUpdate. A hívó
// (extractRealtimeUpdatesFromTrips lent) tripId-nkénti Map-ből adja át a
// megfelelő választ minden identitásra.
export function extractSubLegRealtimeUpdate(
  tripResponse: MotisItinerary | null | undefined,
  identity: RealtimeRefreshIdentity
): RealtimeLegUpdate | null {
  if (!identity.tripId) return null;
  // Sub-leg-kivágáshoz MINDKÉT határpont-stopId kötelező — enélkül nincs
  // biztonságos mód a teljes trip span-jéből a user saját szakaszát
  // kivágni, ezért inkább no-op, mint egy hibás (teljes-trip) idő.
  if (!identity.fromStopId || !identity.toStopId) return null;
  if (!tripResponse) return null;

  const tripLeg = (tripResponse.legs ?? []).find((leg) => matchesTripIdentity(leg, identity));
  if (!tripLeg) return null;

  const stopSequence: MotisPlace[] = [
    ...(tripLeg.from ? [tripLeg.from] : []),
    ...(tripLeg.intermediateStops ?? []),
    ...(tripLeg.to ? [tripLeg.to] : []),
  ];
  const fromStop = findStopById(stopSequence, identity.fromStopId);
  const toStop = findStopById(stopSequence, identity.toStopId);
  // Nem találtunk pontosan egyező stopId-t a válasz megálló-sorozatában —
  // csendes no-op, SOHA nem közelítünk a legközelebbi stophoz.
  if (!fromStop || !toStop) return null;

  if (tripLeg.cancelled === true) {
    // PROVEN cancellation — ugyanaz az elsőbbségi szabály, mint Sprint
    // 7.2-ben (lásd mergeRealtimeUpdates.ts), csak innen, a /trip válasz
    // teljes-trip-szintű cancelled mezőjéből (a MOTIS a teljes fizikai
    // trip törlését jelzi, ami a benne lévő minden sub-leget érinti).
    return {
      tripId: identity.tripId,
      routeId: identity.routeId,
      realtime: Boolean(tripLeg.realTime),
      cancelled: true,
    };
  }

  const departureTime = fromStop.departure;
  const arrivalTime = toStop.arrival;
  const scheduledDepartureTime = fromStop.scheduledDeparture;
  const scheduledArrivalTime = toStop.scheduledArrival;

  // KÓD-REVIEW KORREKCIÓ (2026-09-23) — MOTIS realtime-szemantika
  // pontosítva: a tripLeg.realTime a TELJES fizikai trip élő
  // (GTFS-RT-alapú) nyomon-követöttségét jelzi — NEM azt, hogy van-e
  // KÉSÉS. Élő VPS-teszt bizonyította, hogy egy PONTOSAN időben futó,
  // realtime-nyomon-követett trip esetén a departure/arrival mezők
  // UGYANÚGY jelen vannak (akár byte-ra megegyeznek a scheduled*
  // mezőkkel) — a departure/arrival JELENLÉTE tehát önmagában SEM
  // késést, SEM realtime-státuszt nem bizonyít, csak azt, hogy VAN
  // konkrét, jelenthető időnk erre a határpontra. A helyes feltétel ezért
  // KÉT FÜGGETLEN, EGYSZERRE szükséges bizonyíték: (1) a MOTIS a TELJES
  // tripet élőnek jelzi (tripLeg.realTime), ÉS (2) van legalább egy
  // ténylegesen jelenthető (nem csak menetrendi) határponti idő a SAJÁT
  // boarding/alighting megállónkon — enélkül "realtime: true"-t
  // állítanánk egy olyan mezőre, amit valójában nem tudunk kitölteni
  // (lásd RealtimeLegUpdate.departureTime/arrivalTime lent). EZ A
  // FELTÉTEL VÁLTOZATLAN maradt a review után — a review megerősítette,
  // hogy NEM szabad "van-e eltérés a menetrendtől" alapján dönteni (egy
  // pontosan időben futó, realtime-nyomon-követett trip is realtime:
  // true kell maradjon), és a jelenlegi Boolean(departureTime ||
  // arrivalTime) ELVE (jelenlét, nem egyenlőség-vizsgálat) EZT már
  // helyesen implementálta — csak a fenti indoklás hiányzott a kódból.
  const realtime = Boolean(tripLeg.realTime) && Boolean(departureTime || arrivalTime);

  // Szintetikus, a KIVÁGOTT sub-leg határpontjaiból épített MotisLeg —
  // KIZÁRÓLAG azért, hogy a MEGLÉVŐ, bizonyított computeDelayMinutes()
  // logikát (orchestrator.ts) változtatás nélkül újra tudjuk használni,
  // ugyanazokkal a mezőkkel (from/to.scheduledDeparture/scheduledArrival,
  // startTime/endTime, realTime), amiket az eredetileg is olvas.
  //
  // KÓD-REVIEW KORREKCIÓ (2026-09-23) — KRITIKUS BUGFIX: a korábbi
  // `startTime: departureTime ?? tripLeg.startTime` / `endTime:
  // arrivalTime ?? tripLeg.endTime` fallback a TELJES fizikai trip SAJÁT
  // origin/destination idejére esett vissza, ha a sub-leg saját
  // határponti ideje nem volt biztonságosan meghatározható. Ez pontosan
  // az a hiba, amit a modul fejléce (KRITIKUS, ÉLŐ VPS-TESZTTEL
  // BIZONYÍTOTT GOTCHA) explicit TILT: egy Kossuth->Déli sub-leg indulása
  // SOHA nem eshet vissza a teljes Örs vezér tere->Déli trip Örs-i
  // indulására — ez egy hibás, más megállóra vonatkozó időt hordozna
  // tovább (és a computeDelayMinutes()-be is bekerülne, hibás
  // delayMinutes-t eredményezve). A fallback ELTÁVOLÍTVA: ha
  // departureTime/arrivalTime nem határozható meg biztonságosan, az adott
  // mező undefined marad (MotisLeg.startTime/endTime opcionális) — ez a
  // computeDelayMinutes()-ben már ma is biztonságos no-op-ot eredményez
  // (leg.endTime ?? leg.startTime hiányában "if (!scheduled || !actual)
  // return undefined"), és a mergeRealtimeUpdates.ts-ben is biztonságos
  // no-op-ot ad az adott mezőre (update.departureTime ?? leg.departureTime
  // — a MEGLÉVŐ leg értékét őrzi meg) — egyik fájlt sem kellett emiatt
  // módosítani.
  const syntheticSubLeg: MotisLeg = {
    ...tripLeg,
    from: fromStop,
    to: toStop,
    startTime: departureTime,
    endTime: arrivalTime,
    realTime: realtime,
  };

  return {
    tripId: identity.tripId,
    routeId: identity.routeId,
    departureTime,
    scheduledDepartureTime,
    arrivalTime,
    scheduledArrivalTime,
    realtime,
    delayMinutes: computeDelayMinutes(syntheticSubLeg),
    // A cancelled mező itt KIZÁRÓLAG akkor undefined, ha a tripLeg
    // ténylegesen NEM cancelled — soha nem "false"-ra állítjuk explicit
    // módon, hogy a mergeRealtimeUpdates.ts meglévő "csak explicit true
    // esetén ír felül" logikája változatlanul működjön.
    cancelled: undefined,
  };
}

// Több identitás + tripId -> /trip-válasz Map alapján állítja elő a teljes
// frissítés-listát — ez az app/api/vedett-route/realtime-refresh/route.ts
// belépési pontja. Hiányzó/null Map-bejegyzés (a /trip hívás nem-ok
// eredménnyel tért vissza, vagy a tripId-t nem is kérdeztük le) ugyanúgy
// csendes no-op-ot eredményez az adott identitásra, mint egy sikeres, de
// nem egyező válasz.
export function extractRealtimeUpdatesFromTrips(
  identities: readonly RealtimeRefreshIdentity[],
  tripResponsesByTripId: ReadonlyMap<string, MotisItinerary | null>
): RealtimeLegUpdate[] {
  const updates: RealtimeLegUpdate[] = [];
  for (const identity of identities) {
    if (!identity.tripId) continue;
    const update = extractSubLegRealtimeUpdate(tripResponsesByTripId.get(identity.tripId) ?? null, identity);
    if (update) updates.push(update);
  }
  return updates;
}
