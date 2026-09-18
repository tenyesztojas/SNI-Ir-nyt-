// SPRINT 8.3 (ROUTE-SPECIFIC DISRUPTION RELEVANCE ENGINE, 2026-09-18) — pure
// TypeScript motor: egy BKK ServiceAlert + az aktuális displayedJourney +
// (ha megbízhatóan rendelkezésre áll) az aktuális navigációs leg-progress
// alapján dönt arról, hogy az alert egy KONKRÉT, MÉG ELŐTTÜNK ÁLLÓ transit
// leget érint-e.
//
// EBBEN A SPRINTBEN: ALERT -> RELEVANCE DECISION készül. NEM: ALERT ->
// AUTOMATIC REROUTE. Ez a modul SOHA nem módosít journey-t, SOHA nem indít
// reroute-ot, SOHA nem ad "szállj le" instrukciót vagy alternatívát.
//
// KRITIKUS SAFETY ELV: FAIL CLOSED. A route/line match (routeId/
// routeShortName egyezés) ÖNMAGÁBAN SOHA nem elég PROVEN_RELEVANT
// döntéshez (lásd az M2 Déli->Kossuth / Örs->Deák regressziós esetet a
// specifikációban). Ha a bizonyíték nem elég erős vagy az időbeli/
// szakasz-átfedés nem bizonyítható, a motor UNKNOWN vagy IRRELEVANT
// eredményt ad — SOHA nem talál ki hiányzó adatot (útvonalgeometriát,
// pozíciót, GPS-progresst).

import type { Journey, JourneyLeg, ServiceAlert } from "../types";

/** A journey egy transit lábjának a motor számára szükséges, MÁR MEGLÉVŐ identitás-adatai. */
export type DisruptionRelevanceLeg = Pick<
  JourneyLeg,
  "mode" | "tripId" | "routeId" | "fromStopId" | "toStopId" | "departureTime" | "arrivalTime"
> & { legIndex: number };

export interface DisruptionRelevanceInput {
  alert: ServiceAlert;
  legs: DisruptionRelevanceLeg[];
  /**
   * A MEGLÉVŐ navigation leg-progress (pl. legTransition.ts
   * resolveWalkToTransitBoundary().resolvedLegIndex) szerinti, MÁR
   * bizonyítottan teljesített legek indexhatára — egy leg "mögöttünk van",
   * ha `legIndex < currentLegIndex`. `null`, HA ez NEM állapítható meg
   * megbízhatóan (rossz GPS/geometria) — ilyenkor a motor NEM találja ki,
   * hogy egy leg mögöttünk van, tehát MINDEN leget megvizsgál (spec 9. pont:
   * "a rossz GPS/geometria nem használható erős bizonyítékként arra, hogy
   * egy disruption mögöttünk van").
   */
  currentLegIndex: number | null;
  nowMs: number;
}

export interface DisruptionEvidence {
  matchedTripId?: string;
  matchedRouteId?: string;
  matchedStopId?: string;
}

export type DisruptionRelevance =
  | {
      status: "PROVEN_RELEVANT";
      alertId: string;
      legIndex: number;
      evidence: DisruptionEvidence;
      reason: string;
    }
  | { status: "IRRELEVANT"; alertId: string; reason: string }
  | { status: "UNKNOWN"; alertId: string; reason: string };

type EntityEvidenceTier =
  | "TRIP_EXACT_NO_STOP"
  | "TRIP_EXACT_STOP_IN_SEGMENT"
  | "TRIP_EXACT_STOP_OUTSIDE_SEGMENT"
  | "ROUTE_STOP_IN_SEGMENT"
  | "ROUTE_STOP_OUTSIDE_SEGMENT"
  | "ROUTE_ONLY"
  | "UNRELATED";

const PROVEN_TIERS: ReadonlySet<EntityEvidenceTier> = new Set([
  "TRIP_EXACT_NO_STOP",
  "TRIP_EXACT_STOP_IN_SEGMENT",
  "ROUTE_STOP_IN_SEGMENT",
]);
const EXCLUSION_TIERS: ReadonlySet<EntityEvidenceTier> = new Set([
  "TRIP_EXACT_STOP_OUTSIDE_SEGMENT",
  "ROUTE_STOP_OUTSIDE_SEGMENT",
]);

function isStopInSegment(stopId: string, leg: DisruptionRelevanceLeg): boolean {
  return stopId === leg.fromStopId || stopId === leg.toStopId;
}

/**
 * EGY informedEntity szelektor bizonyíték-erősségének osztályozása egy adott
 * leggel szemben. A stop-only (fuzzy névegyezés) evidence-t SZÁNDÉKOSAN nem
 * kezeli ez a motor — csak a stabil stopId-t (spec 7.C: "egy stopnév fuzzy/
 * string egyezése önmagában ne legyen strong evidence, ha stabil stopId
 * rendelkezésre állhat").
 */
function classifyEntity(
  entity: { routeId?: string; tripId?: string; stopId?: string },
  leg: DisruptionRelevanceLeg,
): EntityEvidenceTier {
  const tripMatches = Boolean(entity.tripId && leg.tripId && entity.tripId === leg.tripId);
  const routeMatches = Boolean(entity.routeId && leg.routeId && entity.routeId === leg.routeId);

  if (tripMatches) {
    if (!entity.stopId) return "TRIP_EXACT_NO_STOP";
    return isStopInSegment(entity.stopId, leg) ? "TRIP_EXACT_STOP_IN_SEGMENT" : "TRIP_EXACT_STOP_OUTSIDE_SEGMENT";
  }
  if (routeMatches) {
    if (!entity.stopId) return "ROUTE_ONLY";
    return isStopInSegment(entity.stopId, leg) ? "ROUTE_STOP_IN_SEGMENT" : "ROUTE_STOP_OUTSIDE_SEGMENT";
  }
  return "UNRELATED";
}

/** Az alert MINDEN activePeriod ablaka lejárt-e (nowMs szerint) — globálisan lejárt alert. */
function isAlertGloballyExpired(alert: ServiceAlert, nowMs: number): boolean {
  const periods = alert.activePeriod;
  if (!periods || periods.length === 0) return false; // nincs megadott ablak -> GTFS-RT szemantika szerint mindig aktív
  return periods.every((p) => typeof p.endSeconds === "number" && p.endSeconds * 1000 < nowMs);
}

type LegTimingClassification = "ACTIVE" | "NOT_OVERLAPPING" | "UNKNOWN_TIMING";

/**
 * Egy MÉG NEM globálisan lejárt alert adott legre vonatkozó időbeli
 * relevanciája. Ha nincs megadott activePeriod, a motor a GTFS-RT szokásos
 * szemantikáját követi (nincs megadott ablak = korlátlanul aktív) — ez NEM
 * kitalálás, ez a feed dokumentált konvenciója.
 */
function classifyActivePeriodForLeg(alert: ServiceAlert, leg: DisruptionRelevanceLeg, nowMs: number): LegTimingClassification {
  const periods = alert.activePeriod;
  if (!periods || periods.length === 0) return "ACTIVE";

  for (const period of periods) {
    const startMs = typeof period.startSeconds === "number" ? period.startSeconds * 1000 : null;
    const endMs = typeof period.endSeconds === "number" ? period.endSeconds * 1000 : null;

    if (endMs !== null && endMs < nowMs) continue; // ez az ablak már lejárt, nézzük a következőt

    if (startMs !== null && startMs > nowMs) {
      // jövőbeli ablak — csak akkor releváns, ha ésszerűen átfedi a leg várható idejét.
      const legStartMs = leg.departureTime ? Date.parse(leg.departureTime) : NaN;
      const legEndMs = leg.arrivalTime ? Date.parse(leg.arrivalTime) : NaN;
      if (Number.isNaN(legStartMs) || Number.isNaN(legEndMs)) return "UNKNOWN_TIMING"; // nincs megbízható idő -> nem találunk ki
      const overlaps = startMs <= legEndMs && (endMs === null || endMs >= legStartMs);
      if (overlaps) return "ACTIVE";
      continue;
    }

    return "ACTIVE"; // jelenleg aktív ablak (start <= now, még nem ért véget)
  }

  return "NOT_OVERLAPPING";
}

/** Egyetlen alert relevanciájának eldöntése a teljes journey-hez képest. */
export function evaluateDisruptionRelevance(input: DisruptionRelevanceInput): DisruptionRelevance {
  const { alert, legs, currentLegIndex, nowMs } = input;
  const alertId = alert?.id ?? "unknown-alert";

  // Fail-closed: hiányos/malformed alert esetén sem crashelünk — defenzív
  // null-coalescing mindenhol, sosem dobunk kivételt.
  const informedEntities = Array.isArray(alert?.informedEntities) ? alert.informedEntities : [];
  if (informedEntities.length === 0) {
    return { status: "UNKNOWN", alertId, reason: "NO_STRUCTURED_ENTITY_DATA" };
  }

  if (isAlertGloballyExpired(alert, nowMs)) {
    return { status: "IRRELEVANT", alertId, reason: "ALERT_EXPIRED" };
  }

  let sawRouteOnly = false;
  let sawExclusion = false;
  let sawUnknownTiming = false;
  let sawTimingNotOverlapping = false;

  const relevantLegs = legs
    .filter((leg) => leg.mode === "TRANSIT")
    .filter((leg) => currentLegIndex === null || leg.legIndex >= currentLegIndex)
    .sort((a, b) => a.legIndex - b.legIndex);

  for (const leg of relevantLegs) {
    const tiers = informedEntities.map((entity) => classifyEntity(entity, leg));
    const provenEntityIndex = tiers.findIndex((tier) => PROVEN_TIERS.has(tier));

    if (provenEntityIndex !== -1) {
      const timing = classifyActivePeriodForLeg(alert, leg, nowMs);
      if (timing === "ACTIVE") {
        const entity = informedEntities[provenEntityIndex];
        return {
          status: "PROVEN_RELEVANT",
          alertId,
          legIndex: leg.legIndex,
          evidence: {
            matchedTripId: entity.tripId,
            matchedRouteId: entity.routeId,
            matchedStopId: entity.stopId,
          },
          reason: tiers[provenEntityIndex],
        };
      }
      if (timing === "UNKNOWN_TIMING") sawUnknownTiming = true;
      if (timing === "NOT_OVERLAPPING") sawTimingNotOverlapping = true;
      continue;
    }

    if (tiers.some((tier) => EXCLUSION_TIERS.has(tier))) sawExclusion = true;
    if (tiers.some((tier) => tier === "ROUTE_ONLY")) sawRouteOnly = true;
  }

  if (sawUnknownTiming) return { status: "UNKNOWN", alertId, reason: "ACTIVE_PERIOD_TIMING_UNCERTAIN" };
  if (sawRouteOnly) return { status: "UNKNOWN", alertId, reason: "ROUTE_ONLY_MATCH_INSUFFICIENT" };
  if (sawExclusion) return { status: "IRRELEVANT", alertId, reason: "STOP_OUTSIDE_JOURNEY_SEGMENT" };
  if (sawTimingNotOverlapping) return { status: "IRRELEVANT", alertId, reason: "ACTIVE_PERIOD_NOT_OVERLAPPING_LEG" };
  return { status: "IRRELEVANT", alertId, reason: "NO_MATCHING_ENTITY" };
}

/** Több alert kiértékelése — csak a bizonyítottan releváns eredmények listáját adja vissza. */
export function filterProvenRelevantDisruptions(
  alerts: ServiceAlert[],
  legs: DisruptionRelevanceLeg[],
  currentLegIndex: number | null,
  nowMs: number,
): Extract<DisruptionRelevance, { status: "PROVEN_RELEVANT" }>[] {
  const results: Extract<DisruptionRelevance, { status: "PROVEN_RELEVANT" }>[] = [];
  for (const alert of alerts ?? []) {
    const decision = evaluateDisruptionRelevance({ alert, legs, currentLegIndex, nowMs });
    if (decision.status === "PROVEN_RELEVANT") results.push(decision);
  }
  return results;
}

/** Segédfüggvény: DisruptionRelevanceLeg[] felépítése egy Journey-ből, legIndex-szel. */
export function toDisruptionRelevanceLegs(journey: Journey): DisruptionRelevanceLeg[] {
  return journey.legs.map((leg, legIndex) => ({
    legIndex,
    mode: leg.mode,
    tripId: leg.tripId,
    routeId: leg.routeId,
    fromStopId: leg.fromStopId,
    toStopId: leg.toStopId,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
  }));
}
