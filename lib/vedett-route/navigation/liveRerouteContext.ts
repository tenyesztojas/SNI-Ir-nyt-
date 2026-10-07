// JOURNEY MONITOR v1 / 3. LÉPÉS (2026-10-07) — a Live Alternative keresés
// HELYES kontextusa.
//
// Két, egymástól független pure probléma:
//
// 1) ROUTING-FELTÉTELEK MEGŐRZÉSE. A normál keresés (lásd
//    VedettUtvonalSearchForm.tsx handleSubmit body) a routingot érdemben
//    befolyásoló mezői: weights, stepFreeRequired, molBubiEnabled,
//    bikePropulsion, timeMode. A sikeres keresés pillanatában ezekről egy
//    minimális SNAPSHOT készül (LiveRerouteSearchContext) — a Live
//    Alternative keresés ezt használja, NEM a form aktuális (azóta esetleg
//    átállított) state-jét. Nincs új preferencia-modell, nincs global store.
//    Szabály: stepFreeRequired=true / molBubiEnabled=true SOHA nem válhat
//    false-szá (több forrás esetén logikai VAGY, és a journey saját
//    bizonyítéka — accessibilityStatus / RENTAL láb — is felfelé húz).
//
// 2) KIINDULÓPONT + IDŐ. Gyaloglás/várakozás közben (nincs felszállva) a
//    friss GPS a helyes origin, departAt = most. Bizonyítottan járművön ülve
//    a felhasználó a következő megállóig NEM tud váltani, ezért az origin az
//    aktív TRANSIT láb leszállási pontja (toLat/toLon), departAt annak
//    realtime (vagy menetrendi) érkezési ideje — SOHA nem "most" egy olyan
//    megállóra, amit a jármű csak később ér el. Ha ez nem megbízható, a
//    keresés KIMARAD (nem esik vissza GPS-originre); a navigáció változatlan.
//
// timeMode DÖNTÉS: a Live Alternative keresés MINDIG "DEPART_AT", departAt =
// az origin időpontja. Indok (route.ts szemantika): ARRIVE_BY esetén a
// departAt az ÉRKEZÉSI HATÁRIDŐ — az eredeti határidő menet közben már
// elérhetetlen lehet (zavar!), ilyenkor a MOTIS üres/irreleváns találatot
// adna; a kérdés pedig az, hogy MOSTANTÓL (ill. a leszállástól) mi a
// leggyorsabb továbbjutás. A döntést az ETA-összehasonlítás hozza
// (journeyMonitor.ts evaluateEtaLiveAlternative) — VÁLTOZATLANUL.

import { normalizePersonalizationWeights } from "../personalization.ts";
import type { Journey, PersonalizationWeights } from "../types.ts";

export type LiveRerouteBikePropulsion = "ANY" | "HUMAN" | "ELECTRIC_ASSIST";
export type LiveRerouteTimeMode = "DEPART_AT" | "ARRIVE_BY";

export interface LiveRerouteSearchContext {
  weights: PersonalizationWeights;
  stepFreeRequired: boolean;
  molBubiEnabled: boolean;
  bikePropulsion: LiveRerouteBikePropulsion;
  /** Csak dokumentációs/diagnosztikai: a Live Alternative keresés SZÁNDÉKOSAN mindig DEPART_AT. */
  timeMode: LiveRerouteTimeMode;
}

const PROPULSIONS: readonly LiveRerouteBikePropulsion[] = ["ANY", "HUMAN", "ELECTRIC_ASSIST"];

/** A normál keresés request-body-jából (ugyanazok a mezőnevek) építi a snapshotot. */
export function buildLiveRerouteSearchContext(body: {
  weights: PersonalizationWeights;
  stepFreeRequired?: boolean;
  molBubiEnabled?: boolean;
  bikePropulsion?: LiveRerouteBikePropulsion;
  timeMode?: LiveRerouteTimeMode;
}): LiveRerouteSearchContext {
  const molBubiEnabled = body.molBubiEnabled === true;
  return {
    weights: normalizePersonalizationWeights(body.weights),
    stepFreeRequired: body.stepFreeRequired === true,
    molBubiEnabled,
    bikePropulsion: molBubiEnabled && body.bikePropulsion && PROPULSIONS.includes(body.bikePropulsion) ? body.bikePropulsion : "ANY",
    timeMode: body.timeMode === "ARRIVE_BY" ? "ARRIVE_BY" : "DEPART_AT",
  };
}

/** Fail-open parse (persisted session): érvénytelen tartalom -> null, SOHA nem dob. */
export function parseLiveRerouteSearchContext(value: unknown): LiveRerouteSearchContext | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.stepFreeRequired !== "boolean" || typeof v.molBubiEnabled !== "boolean") return null;
  if (!v.weights || typeof v.weights !== "object") return null;
  const propulsion = PROPULSIONS.includes(v.bikePropulsion as LiveRerouteBikePropulsion)
    ? (v.bikePropulsion as LiveRerouteBikePropulsion)
    : "ANY";
  return buildLiveRerouteSearchContext({
    weights: v.weights as PersonalizationWeights,
    stepFreeRequired: v.stepFreeRequired,
    molBubiEnabled: v.molBubiEnabled,
    bikePropulsion: propulsion,
    timeMode: v.timeMode === "ARRIVE_BY" ? "ARRIVE_BY" : "DEPART_AT",
  });
}

/**
 * Az effektív kontextus a Live Alternative kereséshez. Források (bármelyik
 * hiányozhat): a navigált session perzisztált kontextusa (restore), a
 * legutóbbi sikeres keresés snapshotja, és a journey SAJÁT bizonyítéka.
 * Booleanok: logikai VAGY — egy true SOHA nem írható felül false-szal.
 * Súlyok: restored -> snapshot -> fallback (a kártya prop-ja).
 */
export function resolveEffectiveLiveRerouteContext(input: {
  restored: LiveRerouteSearchContext | null | undefined;
  snapshot: LiveRerouteSearchContext | null | undefined;
  journey: Journey;
  fallbackWeights: PersonalizationWeights;
}): LiveRerouteSearchContext {
  const sources = [input.restored, input.snapshot].filter((c): c is LiveRerouteSearchContext => !!c);
  // accessibilityStatus KIZÁRÓLAG stepFreeRequired=true keresésnél kerül a journey-ba (types.ts).
  const journeyStepFree = input.journey.accessibilityStatus !== undefined;
  // RENTAL láb csak molBubiEnabled=true keresésből származhat (orchestrator.ts mapLeg).
  const journeyBubi = input.journey.legs.some((leg) => leg.mode === "RENTAL");
  const stepFreeRequired = journeyStepFree || sources.some((c) => c.stepFreeRequired);
  const molBubiEnabled = journeyBubi || sources.some((c) => c.molBubiEnabled);
  const propulsionSource = sources.find((c) => c.molBubiEnabled && c.bikePropulsion !== "ANY");
  return {
    weights: sources[0]?.weights ?? input.fallbackWeights,
    stepFreeRequired,
    molBubiEnabled,
    bikePropulsion: molBubiEnabled && propulsionSource ? propulsionSource.bikePropulsion : "ANY",
    timeMode: sources[0]?.timeMode ?? "DEPART_AT",
  };
}

// ---------------------------------------------------------------------------
// Origin feloldás
// ---------------------------------------------------------------------------

/** A walk→transit boundary fázisai (lásd useWalkToTransitBoundary). */
export type LiveRerouteBoundaryPhase =
  | "NOT_APPLICABLE"
  | "WALKING"
  | "APPROACHING_BOARDING"
  | "AT_BOARDING_AREA"
  | "BOARDED"
  | "BOARDED_UNCERTAIN_GEOMETRY"
  | "ARRIVED";

/** Ennyivel lehet a leszállási idő a múltban (adat-késés), utána már nem megbízható. */
export const ALIGHTING_TIME_STALE_TOLERANCE_MS = 2 * 60 * 1000;

export type LiveRerouteOrigin =
  | { kind: "GPS"; latitude: number; longitude: number; departAtMs: number }
  | {
      kind: "ALIGHTING";
      latitude: number;
      longitude: number;
      name: string;
      departAtMs: number;
      timeBasis: "REALTIME_ARRIVAL" | "SCHEDULED_ARRIVAL";
      legIndex: number;
    }
  | {
      kind: "SKIP";
      reason: "NO_GPS" | "NO_ALIGHTING_COORDINATE" | "NO_ALIGHTING_TIME" | "ACTIVE_LEG_CANCELLED";
    };

function parseMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

const NOT_BOARDED_PHASES: readonly LiveRerouteBoundaryPhase[] = [
  "WALKING",
  "APPROACHING_BOARDING",
  "AT_BOARDING_AREA",
  "ARRIVED",
];

/**
 * A kiinduló pontot a TÉNYLEGES navigációs fázis + aktív láb dönti el, NEM a
 * trigger típusa (CANCELLED/MISSED_CONNECTION is ugyanígy):
 *  - nincs felszállva (WALKING/APPROACHING/AT_BOARDING_AREA/ARRIVED), vagy az
 *    aktív láb nem TRANSIT -> GPS origin, departAt = most;
 *  - bizonyítottan járművön (BOARDED*), vagy fázis nélkül TRANSIT aktív láb
 *    -> az aktív TRANSIT láb leszállási pontja + érkezési ideje;
 *  - járművön, megbízható leszállási koordináta/idő nélkül -> SKIP.
 */
export function resolveLiveRerouteOrigin(input: {
  journey: Journey;
  activeLegIndex: number | null;
  boundaryPhase: LiveRerouteBoundaryPhase | null;
  currentPosition: { latitude: number; longitude: number } | null;
  nowMs: number;
}): LiveRerouteOrigin {
  const { journey, activeLegIndex, boundaryPhase, currentPosition, nowMs } = input;
  const activeLeg =
    activeLegIndex !== null && activeLegIndex >= 0 && activeLegIndex < journey.legs.length
      ? journey.legs[activeLegIndex]
      : null;

  const provenNotBoarded = boundaryPhase !== null && NOT_BOARDED_PHASES.includes(boundaryPhase);
  const provenBoarded = boundaryPhase === "BOARDED" || boundaryPhase === "BOARDED_UNCERTAIN_GEOMETRY";
  const possiblyRiding = provenBoarded || (!provenNotBoarded && activeLeg?.mode === "TRANSIT");

  if (!possiblyRiding) {
    if (!currentPosition) return { kind: "SKIP", reason: "NO_GPS" };
    return { kind: "GPS", latitude: currentPosition.latitude, longitude: currentPosition.longitude, departAtMs: nowMs };
  }

  if (!activeLeg || activeLeg.mode !== "TRANSIT" || activeLegIndex === null) {
    return { kind: "SKIP", reason: "NO_ALIGHTING_COORDINATE" };
  }
  // Fázis-bizonyíték nélküli, TÖRÖLT aktív járat: nem ülhet rajta — a
  // felhasználó a megállóban áll, a GPS a helyes origin.
  if (activeLeg.cancelled === true) {
    if (provenBoarded) return { kind: "SKIP", reason: "ACTIVE_LEG_CANCELLED" };
    if (!currentPosition) return { kind: "SKIP", reason: "NO_GPS" };
    return { kind: "GPS", latitude: currentPosition.latitude, longitude: currentPosition.longitude, departAtMs: nowMs };
  }
  const lat = activeLeg.toLat;
  const lon = activeLeg.toLon;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: "SKIP", reason: "NO_ALIGHTING_COORDINATE" };
  }

  const arrivalMs = parseMs(activeLeg.arrivalTime);
  const scheduledMs = parseMs(activeLeg.scheduledArrivalTime);
  let anchorMs: number | null = null;
  let timeBasis: "REALTIME_ARRIVAL" | "SCHEDULED_ARRIVAL" = "SCHEDULED_ARRIVAL";
  if (activeLeg.realtime === true && arrivalMs !== null) {
    anchorMs = arrivalMs;
    timeBasis = "REALTIME_ARRIVAL";
  } else if (arrivalMs !== null) {
    anchorMs = arrivalMs; // realtime nélkül az arrivalTime maga a menetrendi idő
  } else if (scheduledMs !== null) {
    anchorMs = scheduledMs;
  }
  if (anchorMs === null) return { kind: "SKIP", reason: "NO_ALIGHTING_TIME" };
  // Régen elmúlt érkezési idő járművön ülve = késő/elavult adat: "most" nem
  // biztonságos (a jármű lehet, hogy csak később ér oda) -> kimarad.
  if (anchorMs < nowMs - ALIGHTING_TIME_STALE_TOLERANCE_MS) return { kind: "SKIP", reason: "NO_ALIGHTING_TIME" };

  return {
    kind: "ALIGHTING",
    latitude: lat,
    longitude: lon,
    name: activeLeg.toName,
    // Tűréshatáron belül múltbeli idő -> most (a szerver a múltbeli departAt-ot elutasítja).
    departAtMs: Math.max(anchorMs, nowMs),
    timeBasis,
    legIndex: activeLegIndex,
  };
}

export interface LiveAlternativeSearchPayload {
  fromCoordinates: { latitude: number; longitude: number };
  fromName?: string;
  toCoordinates: { latitude: number; longitude: number };
  toName: string;
  departAt: string;
  timeMode: "DEPART_AT";
  weights: PersonalizationWeights;
  stepFreeRequired: boolean;
  molBubiEnabled: boolean;
  bikePropulsion: LiveRerouteBikePropulsion;
}

/** Az /api/admin/vedett-utvonal/search request-body a Live Alternative kereséshez (SKIP origin -> null). */
export function buildLiveAlternativeSearchPayload(input: {
  origin: LiveRerouteOrigin;
  destination: { lat: number; lon: number; name: string };
  context: LiveRerouteSearchContext;
}): LiveAlternativeSearchPayload | null {
  const { origin, destination, context } = input;
  if (origin.kind === "SKIP") return null;
  return {
    fromCoordinates: { latitude: origin.latitude, longitude: origin.longitude },
    ...(origin.kind === "ALIGHTING" ? { fromName: origin.name } : {}),
    toCoordinates: { latitude: destination.lat, longitude: destination.lon },
    toName: destination.name,
    departAt: new Date(origin.departAtMs).toISOString(),
    timeMode: "DEPART_AT",
    weights: context.weights,
    stepFreeRequired: context.stepFreeRequired,
    molBubiEnabled: context.molBubiEnabled,
    bikePropulsion: context.molBubiEnabled ? context.bikePropulsion : "ANY",
  };
}
