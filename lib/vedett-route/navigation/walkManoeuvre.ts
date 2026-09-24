// NAVIGATION — WALK MANOEUVRE ENGINE (Sprint 4, 2026-09-16).
//
// Tisztán geometriai, pure, determinisztikus modul: egy WALK leg SAJÁT
// koordinátalistájából (lib/vedett-route/geometry.ts
// NavigationLegGeometryRange.legCoordinates — UGYANAZ a leg-lokális
// geometria, amit a Sprint 3 stop-progress is használ) egy rendezett
// WalkManoeuvre listát épít.
//
// NINCS React/UI import, NINCS browser API (GPS/DOM), NINCS state — a
// modul KIZÁRÓLAG a bemenetként átadott koordinátatömbtől függ.
//
// SZÁNDÉKOSAN NEM RÉSZE ennek a sprintnek (lásd a sprint specifikációja):
//   - utcanév/streetName, OSM ID, "kimondott" (spoken) szöveg — ez egy
//     TISZTÁN geometriai domain modell, nincs szemantikai réteg;
//   - React/UI bekötés — ez a modul MOST még sehonnan nem hívódik;
//   - GPS/progress módosítás — a matchedSegmentIndex/routeProgress
//     rendszer ebben a sprintben TELJESEN érintetlen;
//   - finomabb kanyar-osztályozás (SLIGHT_*, SHARP_*, U_TURN, ROUNDABOUT,
//     STAIRS, CROSSING) — csak TURN_LEFT/TURN_RIGHT az első verzióban;
//   - mesterséges CONTINUE események — a "kind" felsorolás tartalmazza a
//     "CONTINUE" értéket (a jövőbeli bővíthetőség miatt), de ez a modul
//     SOHA nem generál CONTINUE-t: ha nincs kanyar, a kimenet egyszerűen
//     [START, ARRIVE].

import { haversineMeters } from "./geometry.ts";
import type { NavigationCoordinate } from "./types.ts";

export type WalkManoeuvreKind = "START" | "CONTINUE" | "TURN_LEFT" | "TURN_RIGHT" | "ARRIVE";

export interface WalkManoeuvre {
  kind: WalkManoeuvreKind;
  // A leg SAJÁT koordinátalistájának (a detectWalkManoeuvres() paramétere)
  // 0-alapú PONT-indexe, amelyre ez a manőver vonatkozik.
  //
  // FONTOS ELNEVEZÉS-ÜTKÖZÉS, TUDATOSAN: ez NEM ugyanaz, mint a Sprint 2/3
  // lib/vedett-route/geometry.ts NavigationLegGeometryRange "segmentIndex"
  // mezője (ami egy ÉL-index: a globális, összefűzött koordinátatömb i. és
  // i+1. pontja KÖZÖTTI szakaszra mutat). Itt egy PONT-index, a leg SAJÁT,
  // lokális koordinátalistáján belül — a mezőnevet a sprint specifikációja
  // írta elő ebben az alakban, de egy jövőbeli bekötésnél ez a
  // különbség NEM keverhető össze.
  segmentIndex: number;
  distanceFromStartMeters: number;
  distanceFromPreviousMeters: number;
  // Csak TURN_LEFT/TURN_RIGHT eseményeken van jelen. Előjel-konvenció
  // (lásd turnDeltaDegrees() lentebb): POZITÍV = jobb, NEGATÍV = bal.
  turnAngleDegrees?: number;
}

// ============================================================================
// KONSTANSOK — névvel ellátott, dokumentált, provider-semleges küszöbök.
// Konzervatív kiindulási értékek; a modul semmilyen BKK/MÁV/Volán-specifikus
// logikát nem tartalmaz.
// ============================================================================

// Egy kanyar-jelölt (candidate) bearing-jét NEM a szomszédos pontokból,
// hanem egy legalább ennyi méteres "karral" (arm) rendelkező, korábbi/
// későbbi referenciapontból számítjuk — ez védi ki a sűrű, apró
// polyline-töréseket (lásd a modul fejlécének 5. pontját).
export const MIN_BEARING_ARM_METERS = 12;

// Egy irányváltozást csak akkor tekintünk kanyarnak, ha abs(delta) eléri
// ezt a fokszámot. Ez alatt a geometriát "egyenesnek" tekintjük.
export const MIN_TURN_ANGLE_DEGREES = 40;

// Két kanyar-jelöltet, amelyek a route mentén ennél közelebb vannak
// egymáshoz, EGY manőverré konszolidálunk (a legerősebb abs(turnAngle)
// jelöltet tartva meg) — így egy lekerekített, több pontból álló valós
// kanyar nem generál kanyar-sorozatot.
export const MIN_MANOEUVRE_SPACING_METERS = 20;

// Az ennél rövidebb (vagy közel duplikált) szomszédos szegmensek önmagukban
// SOSEM generálnak önálló manővert — a pontot "zajként" hagyjuk figyelmen
// kívül a candidate-keresés során (a bearing-referencia keresés a
// kumulatív távolság-összegzés miatt ettől függetlenül helyesen "átlép"
// rajtuk).
export const MIN_SEGMENT_METERS = 1;

// BUGFIX (2026-09-24, valós M2 gyalogos megközelítési hiba): a
// findBearingReferenceBefore()/findBearingReferenceAfter() a candidate
// előtti/utáni MIN_BEARING_ARM_METERS (12m) kart keresi — de ha a
// candidate a LEG GEOMETRIÁJÁNAK ELEJÉHEZ/VÉGÉHEZ 12 méternél közelebb
// van (pl. egy valódi kanyar közvetlen a bejárat/állomás-megközelítés
// előtt, a WALK leg-határhoz közel), a keresés a tömb szélére ér ANÉLKÜL,
// hogy elérné a 12m-t, és korábban null-t adott vissza — így a candidate
// EGÉSZBEN kiesett az értékelésből, még akkor is, ha valódi, éles
// (>=MIN_TURN_ANGLE_DEGREES) kanyar volt. Ez néma manőver-vesztést
// okozott pontosan ott, ahol a leggyakoribb: a leg végén, közvetlen az
// érkezés (állomás-bejárat/beszállás) előtt.
//
// JAVÍTÁS: ha a tömb szélére érünk a teljes kar (12m) elérése előtt, a
// TÉNYLEGESEN elérhető, valós geometriai VÉGPONTOT (index 0, ill.
// coords.length - 1) használjuk referenciaként — ez NEM kitalált pont,
// hanem maga a leg valós geometriai vége/eleje —, DE csak akkor, ha az
// addig megtett kumulatív távolság eléri ezt a (12 méternél kisebb)
// minimumot. Ez alatt a bearing megbízhatatlan lenne (GPS/OSM-zaj), ezért
// ott TOVÁBBRA IS null-t adunk vissza (nincs kitalálva semmi).
export const MIN_BOUNDARY_BEARING_ARM_METERS = 3;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Pure helper: bearing (irányszög) két WGS84 koordináta között, 0..360
// fokban (0/360 = észak, 90 = kelet, 180 = dél, 270 = nyugat). Null, ha a
// bemenet invalid (nem finite), vagy a két pont AZONOS (nincs értelmes
// irány egy nulla hosszú szakaszhoz — ez SOSEM generál hamis kanyart).
export function bearingDegrees(a: NavigationCoordinate, b: NavigationCoordinate): number | null {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  if (!Number.isFinite(lon1) || !Number.isFinite(lat1) || !Number.isFinite(lon2) || !Number.isFinite(lat2)) {
    return null;
  }
  if (lon1 === lon2 && lat1 === lat2) return null;

  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return (θ * RAD_TO_DEG + 360) % 360;
}

// Pure helper: normalizált, előjeles bearing-delta -180..180 fok között.
//
// KONVENCIÓ (dokumentálva és tesztelve, lásd
// __tests__/vedett-route/navigation-walk-manoeuvre.test.ts):
//   POZITÍV delta = JOBB kanyar (az irányszög nő, óramutató járása szerint);
//   NEGATÍV delta = BAL kanyar (az irányszög csökken).
// Példa: 350° -> 10° bearing-váltás +20°-ot ad (NEM -340°-ot).
export function turnDeltaDegrees(fromBearingDegrees: number, toBearingDegrees: number): number {
  return ((toBearingDegrees - fromBearingDegrees + 540) % 360) - 180;
}

// A candidate PONT előtt legalább `armMeters` kumulatív távolságra lévő,
// legközelebbi pont indexe — vagy null, ha a geometria elején nincs elég
// hely (a candidate emiatt NEM kap kanyar-értékelést, lásd a fejléc
// "geometry fallback" pontját).
function findBearingReferenceBefore(coords: readonly NavigationCoordinate[], candidateIndex: number, armMeters: number): number | null {
  let cumulative = 0;
  for (let j = candidateIndex - 1; j >= 0; j -= 1) {
    cumulative += haversineMeters(coords[j], coords[j + 1]);
    if (cumulative >= armMeters) return j;
  }
  // LEG-HATÁR FALLBACK (lásd MIN_BOUNDARY_BEARING_ARM_METERS fejléce): a
  // teljes kar nem fért ki a leg elejéig, de a ténylegesen megtett
  // távolság még mindig elég egy megbízható bearinghez -> a valós
  // geometriai KEZDŐPONTOT (index 0) használjuk referenciaként.
  if (cumulative >= MIN_BOUNDARY_BEARING_ARM_METERS) return 0;
  return null;
}

// Ugyanez a candidate UTÁN.
function findBearingReferenceAfter(coords: readonly NavigationCoordinate[], candidateIndex: number, armMeters: number): number | null {
  let cumulative = 0;
  for (let j = candidateIndex + 1; j < coords.length; j += 1) {
    cumulative += haversineMeters(coords[j - 1], coords[j]);
    if (cumulative >= armMeters) return j;
  }
  // LEG-HATÁR FALLBACK — ugyanaz, mint findBearingReferenceBefore()-nál,
  // csak a leg VÉGPONTJÁVAL (coords.length - 1).
  if (cumulative >= MIN_BOUNDARY_BEARING_ARM_METERS) return coords.length - 1;
  return null;
}

// Egy pontot "zajként" hagyunk figyelmen kívül candidate-ként, ha MINDKÉT
// szomszédos (nyers, közvetlen) szegmense rövidebb, mint MIN_SEGMENT_METERS
// — ez tipikusan egy duplikált vagy majdnem duplikált geometriai pont,
// aminél a "kanyar" fogalma nem értelmes.
function isNoiseVertex(coords: readonly NavigationCoordinate[], index: number): boolean {
  const incoming = haversineMeters(coords[index - 1], coords[index]);
  const outgoing = haversineMeters(coords[index], coords[index + 1]);
  return incoming < MIN_SEGMENT_METERS && outgoing < MIN_SEGMENT_METERS;
}

interface TurnCandidate {
  index: number;
  distanceFromStartMeters: number;
  turnAngleDegrees: number;
  kind: "TURN_LEFT" | "TURN_RIGHT";
}

// Pure, determinisztikus fő függvény: WALK leg SAJÁT koordinátalistája ->
// rendezett WalkManoeuvre lista ([START, ...TURN_LEFT/TURN_RIGHT..., ARRIVE],
// route-sorrendben).
//
// GEOMETRY FALLBACK: nem-finite koordinátákat kiszűrjük; ha a szűrés után
// 2-nél kevesebb pont marad, üres tömböt adunk vissza (SOSEM dob kivételt,
// SOSEM talál ki kanyart). Pontosan 2 pont esetén [START, ARRIVE] a helyes,
// biztonságos eredmény (nincs elég geometria kanyar-értékeléshez).
export function detectWalkManoeuvres(legCoordinates: readonly NavigationCoordinate[]): WalkManoeuvre[] {
  const coords = legCoordinates.filter(
    (point) => Number.isFinite(point[0]) && Number.isFinite(point[1])
  );
  if (coords.length < 2) return [];

  const cumulativeFromStart: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cumulativeFromStart.push(cumulativeFromStart[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  const totalDistanceMeters = cumulativeFromStart[cumulativeFromStart.length - 1];

  const candidates: TurnCandidate[] = [];
  for (let i = 1; i < coords.length - 1; i += 1) {
    if (isNoiseVertex(coords, i)) continue;

    const referenceBefore = findBearingReferenceBefore(coords, i, MIN_BEARING_ARM_METERS);
    const referenceAfter = findBearingReferenceAfter(coords, i, MIN_BEARING_ARM_METERS);
    if (referenceBefore === null || referenceAfter === null) continue;

    const incomingBearing = bearingDegrees(coords[referenceBefore], coords[i]);
    const outgoingBearing = bearingDegrees(coords[i], coords[referenceAfter]);
    if (incomingBearing === null || outgoingBearing === null) continue;

    const delta = turnDeltaDegrees(incomingBearing, outgoingBearing);
    if (Math.abs(delta) < MIN_TURN_ANGLE_DEGREES) continue;

    candidates.push({
      index: i,
      distanceFromStartMeters: cumulativeFromStart[i],
      turnAngleDegrees: delta,
      kind: delta > 0 ? "TURN_RIGHT" : "TURN_LEFT",
    });
  }

  // KONSZOLIDÁCIÓ (determinisztikus, láncolt): a route mentén haladva, ha a
  // következő candidate a JELENLEG NYITOTT klaszter UTOLSÓ (esetleg már
  // cserélt) tagjától MIN_MANOEUVRE_SPACING_METERS-nél közelebb van, a
  // klaszterbe olvasztjuk — a klaszterből a legerősebb abs(turnAngle)
  // candidate marad meg. Ez egy lekerekített, sok pontból álló valós
  // kanyart EGY manőverré von össze.
  const consolidated: TurnCandidate[] = [];
  for (const candidate of candidates) {
    const last = consolidated[consolidated.length - 1];
    if (last && candidate.distanceFromStartMeters - last.distanceFromStartMeters < MIN_MANOEUVRE_SPACING_METERS) {
      if (Math.abs(candidate.turnAngleDegrees) > Math.abs(last.turnAngleDegrees)) {
        consolidated[consolidated.length - 1] = candidate;
      }
      continue;
    }
    consolidated.push(candidate);
  }

  const manoeuvres: WalkManoeuvre[] = [
    { kind: "START", segmentIndex: 0, distanceFromStartMeters: 0, distanceFromPreviousMeters: 0 },
  ];

  let previousDistanceMeters = 0;
  for (const candidate of consolidated) {
    manoeuvres.push({
      kind: candidate.kind,
      segmentIndex: candidate.index,
      distanceFromStartMeters: candidate.distanceFromStartMeters,
      distanceFromPreviousMeters: candidate.distanceFromStartMeters - previousDistanceMeters,
      turnAngleDegrees: candidate.turnAngleDegrees,
    });
    previousDistanceMeters = candidate.distanceFromStartMeters;
  }

  manoeuvres.push({
    kind: "ARRIVE",
    segmentIndex: coords.length - 1,
    distanceFromStartMeters: totalDistanceMeters,
    distanceFromPreviousMeters: totalDistanceMeters - previousDistanceMeters,
  });

  return manoeuvres;
}
