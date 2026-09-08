// Sprint E Preparation Gate — determinisztikus pihenőpont-rangsorolás.
//
// SZABÁLY (a projekt már meglévő Sensory Engine mintáját követve, lásd
// lib/vedett-route/sensoryEngine.ts fejléce): hiányzó adat SOHA nem
// számít bele 0/negatív értékként a pontszámba. Egy nem elérhető faktor
// kimarad a súlyozott átlag számlálójából ÉS nevezőjéből is, és a
// "missingFactors" listában jelenik meg, csökkentve a "confidence"
// értéket. NINCS LLM-hívás sehol ebben a modulban — csak aritmetika.

import type {
  RankedRestPoint,
  RestPointRankingFactorKey,
  RestPointRankingFactorResult,
  RestPointRankingScore,
  RestPointRankingWeights,
  RestPointUserPreference,
} from "./types.ts";
import { DEFAULT_REST_POINT_RANKING_WEIGHTS } from "./types.ts";
import type { RestPoint } from "../../rest-points/types.ts";

const EARTH_RADIUS_METERS = 6_371_000;

// Haversine — egyszerű, determinisztikus, nincs külső függőség.
export function haversineDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Távolság -> 0-100 pontszám (közelebb = magasabb pontszám). 0 méteren
// 100 pont, majd egy 2000 méteres "puha" léptékkel csökken — ez egy
// szándékosan egyszerű, dokumentált, NEM tanult/becsült formula (nem
// állítjuk, hogy ez az egyetlen helyes görbe, csak hogy determinisztikus
// és monoton csökkenő).
function distanceToScore(meters: number): number {
  const scale = 2000;
  const score = 100 * Math.exp(-meters / scale);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

// boolean | null mezőkhöz: null = HIÁNYZÓ adat (unavailable), NEM "false".
// true/false = TÉNYLEGESEN ismert adat (available), akkor is, ha az érték
// maga "nincs" (pl. seating: false ténylegesen azt jelenti, hogy a
// létrehozó explicit jelezte: nincs ülőhely — ez ismert, nem hiányzó adat).
function boolFactor(
  key: RestPointRankingFactorKey,
  value: boolean | null,
  weight: number,
  reasonUnavailable: string
): RestPointRankingFactorResult {
  if (value === null) {
    return { key, available: false, weight, reasonUnavailable };
  }
  return { key, available: true, rawValue: value, normalizedScore: value ? 100 : 0, weight };
}

// A "purchaseRequired" faktornál a MAGASABB pontszám itt is "jobb
// pihenőpont"-ot jelent — tehát purchaseRequired=false (nincs vásárlási
// kötelezettség) kap magas pontszámot, true alacsonyat. Ugyanaz a
// boolFactor logika, csak invertálva.
function purchaseRequiredFactor(value: boolean | null, weight: number): RestPointRankingFactorResult {
  if (value === null) {
    return { key: "purchaseRequired", available: false, weight, reasonUnavailable: "A pihenőpont létrehozója nem adott meg vásárlási kötelezettség adatot." };
  }
  return { key: "purchaseRequired", available: true, rawValue: value, normalizedScore: value ? 0 : 100, weight };
}

// indoors/outdoors -> egyetlen "shelter" faktorba összevonva. Csak akkor
// available, ha LEGALÁBB az egyik mező ismert (nem mindkettő null) — ha
// mindkettő ismert és ellentmond egymásnak (elvileg mindkettő lehet
// true/false függetlenül, pl. van beltéri ÉS kültéri rész is), egyszerű
// átlagot veszünk a két ismert érték pontszámából.
function shelterFactor(indoors: boolean | null, outdoors: boolean | null, weight: number): RestPointRankingFactorResult {
  const known: number[] = [];
  if (indoors !== null) known.push(indoors ? 100 : 40); // beltéri enyhén preferált (időjárás-védettség)
  if (outdoors !== null) known.push(outdoors ? 70 : 40);
  if (known.length === 0) {
    return { key: "shelter", available: false, weight, reasonUnavailable: "Sem beltéri, sem kültéri adat nincs megadva a pihenőponthoz." };
  }
  const avg = known.reduce((a, b) => a + b, 0) / known.length;
  return { key: "shelter", available: true, normalizedScore: Math.round(avg * 10) / 10, weight };
}

function distanceFactor(
  currentPosition: { lat: number; lon: number } | null,
  restPoint: RestPoint,
  weight: number
): { factor: RestPointRankingFactorResult; distanceMeters?: number } {
  if (!currentPosition) {
    return {
      factor: {
        key: "distance",
        available: false,
        weight,
        reasonUnavailable: "Nincs ismert aktuális pozíció (GPS nincs engedélyezve vagy nem elérhető).",
      },
    };
  }
  const distanceMeters = haversineDistanceMeters(currentPosition, { lat: restPoint.latitude, lon: restPoint.longitude });
  return {
    factor: { key: "distance", available: true, rawValue: distanceMeters, normalizedScore: distanceToScore(distanceMeters), weight },
    distanceMeters: Math.round(distanceMeters),
  };
}

// Nyitvatartás: a rest_points séma JELENLEG NEM tartalmaz nyitvatartási
// mezőt (lásd supabase/migrations/20260907_rest_points.sql) — ezért ez a
// faktor MINDIG unavailable, amíg a séma nem bővül. Ez SZÁNDÉKOS és
// őszinte — nem szimulálunk vagy becslünk nyitvatartást.
function openingHoursFactor(weight: number): RestPointRankingFactorResult {
  return {
    key: "openingHours",
    available: false,
    weight,
    reasonUnavailable: "A rest_points séma jelenlegi verziója nem tartalmaz nyitvatartási adatot.",
  };
}

// userPreference: CSAK akkor available, ha a hívó ténylegesen átadott egy
// RestPointUserPreference objektumot — soha nem feltételezett/rejtett
// alapértelmezés.
function userPreferenceFactor(
  restPoint: RestPoint,
  preference: RestPointUserPreference | undefined,
  weight: number
): RestPointRankingFactorResult {
  if (!preference) {
    return { key: "userPreference", available: false, weight, reasonUnavailable: "Nincs megadva felhasználói preferencia ehhez a kereséshez." };
  }
  const scores: number[] = [];
  if (preference.preferQuiet !== undefined && restPoint.quietSpace !== null) {
    scores.push(restPoint.quietSpace === preference.preferQuiet ? 100 : 30);
  }
  if (preference.preferIndoors !== undefined && restPoint.indoors !== null) {
    scores.push(restPoint.indoors === preference.preferIndoors ? 100 : 30);
  }
  if (preference.avoidPurchaseRequired !== undefined && restPoint.purchaseRequired !== null) {
    const matches = preference.avoidPurchaseRequired ? restPoint.purchaseRequired === false : true;
    scores.push(matches ? 100 : 30);
  }
  if (scores.length === 0) {
    // Volt preferencia, de a pihenőponton nincs olyan mező, amivel
    // összevethető lenne — ez is "hiányzó adat", nem "rossz pont".
    return { key: "userPreference", available: false, weight, reasonUnavailable: "A megadott preferenciákhoz nincs összevethető adat ezen a pihenőponton." };
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { key: "userPreference", available: true, normalizedScore: Math.round(avg * 10) / 10, weight };
}

export function rankRestPoint(
  restPoint: RestPoint,
  currentPosition: { lat: number; lon: number } | null,
  weightsInput?: Partial<RestPointRankingWeights>,
  userPreference?: RestPointUserPreference
): RankedRestPoint {
  const weights = { ...DEFAULT_REST_POINT_RANKING_WEIGHTS, ...weightsInput };

  const { factor: distFactor, distanceMeters } = distanceFactor(currentPosition, restPoint, weights.distance);

  const factors: RestPointRankingFactorResult[] = [
    distFactor,
    boolFactor("seating", restPoint.seating, weights.seating, "A pihenőpont létrehozója nem adott meg ülőhely adatot."),
    boolFactor("toilet", restPoint.toilet, weights.toilet, "A pihenőpont létrehozója nem adott meg mosdó adatot."),
    boolFactor("quietSpace", restPoint.quietSpace, weights.quietSpace, "A pihenőpont létrehozója nem adott meg csendes tér adatot."),
    shelterFactor(restPoint.indoors, restPoint.outdoors, weights.shelter),
    purchaseRequiredFactor(restPoint.purchaseRequired, weights.purchaseRequired),
    openingHoursFactor(weights.openingHours),
    userPreferenceFactor(restPoint, userPreference, weights.userPreference),
  ];

  const available = factors.filter((f) => f.available);
  const missing = factors.filter((f) => !f.available);

  const weightedSum = available.reduce((sum, f) => sum + (f.normalizedScore ?? 0) * f.weight, 0);
  const weightTotal = available.reduce((sum, f) => sum + f.weight, 0);
  const score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : 0;

  const allWeightTotal = factors.reduce((sum, f) => sum + f.weight, 0);
  const confidence = allWeightTotal > 0 ? Math.round((weightTotal / allWeightTotal) * 100) / 100 : 0;

  const ranking: RestPointRankingScore = {
    score,
    confidence,
    availableFactors: available.map((f) => f.key),
    missingFactors: missing.map((f) => f.key),
    factors,
  };

  return { restPoint, ranking, distanceMeters };
}

// Rangsorolás: determinisztikus rendezés — csökkenő score szerint, egyenlő
// score esetén (ritka, de lehetséges) az id szerint (stabil, reprodukálható
// sorrend, SOSEM véletlenszerű).
export function rankRestPoints(
  restPoints: RestPoint[],
  currentPosition: { lat: number; lon: number } | null,
  weightsInput?: Partial<RestPointRankingWeights>,
  userPreference?: RestPointUserPreference
): RankedRestPoint[] {
  return restPoints
    .map((rp) => rankRestPoint(rp, currentPosition, weightsInput, userPreference))
    .sort((a, b) => {
      if (b.ranking.score !== a.ranking.score) return b.ranking.score - a.ranking.score;
      return a.restPoint.id.localeCompare(b.restPoint.id);
    });
}
