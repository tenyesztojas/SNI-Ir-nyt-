// SPRINT 8.2 (NAVIGATION SESSION PERSISTENCE, 2026-09-18) — pure
// serialize/validate/save/load/clear modul az aktív navigáció reload/tab-
// eviction túléléséhez. KIZÁRÓLAG a navigáció STABIL alapját (destination +
// displayedJourney azonosító/megjelenítési adatai) perzisztálja — SOHA nem
// GPS/off-route/progress/realtime runtime állapotot (lásd
// sanitizeRestoredJourney() lent és a hívó oldali wiring kommentjeit).
//
// FONTOS: ez a modul NEM ismeri a foreground-reacquisitiont (lásd
// foregroundReacquisition.ts) — a kettő KÜLÖN fogalom (ugyanaz a JS-session
// háttérből tér vissza, vs. egy ÚJ JS-session storage-ból áll helyre), a
// hívó (VedettUtvonalSearchForm.tsx) tartja külön a két recovery-refet, még
// ha a fázis-átmenet pure logikáját (ForegroundRecoveryState-hez hasonló
// minta) újra is használja.

import type { Journey, JourneyLeg } from "../types";

export const NAVIGATION_SESSION_SCHEMA_VERSION = 1 as const;

/** Konzervatív default: egy tegnapi navigáció ne éledjen újra automatikusan. */
export const NAVIGATION_SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 óra

export const NAVIGATION_SESSION_STORAGE_KEY = "vedett-route:navigation-session:v1";

// A hívó (RankedJourneyCard — lásd VedettUtvonalSearchForm.tsx) EBBEN a
// kártyában NEM tart külön "RouteDestination" search-input state-et (az a
// KÜLSŐ, kereső-form komponens saját state-e) — a kártya saját, stabil úti
// cél-adata a displayedJourney UTOLSÓ lábának végpontja. Ezért itt egy
// egyszerű, a journey struktúrájából levezethető alakot használunk, NEM a
// searchRequestBuilder.ts RouteDestination típusát (amihez ennek a
// kártyának egyáltalán nincs hozzáférése).
export interface PersistedNavigationDestination {
  name: string;
  latitude?: number;
  longitude?: number;
}

export interface PersistedNavigationSession {
  schemaVersion: typeof NAVIGATION_SESSION_SCHEMA_VERSION;
  savedAt: number;
  navigationActive: true;
  destination: PersistedNavigationDestination;
  displayedJourney: Journey;
}

/** A displayedJourney UTOLSÓ lábának végpontjából vezeti le a stabil úti célt. */
export function deriveDestinationFromJourney(journey: Journey): PersistedNavigationDestination {
  const lastLeg = journey.legs[journey.legs.length - 1];
  return {
    name: lastLeg?.toName ?? "Cél",
    latitude: lastLeg?.toLat,
    longitude: lastLeg?.toLon,
  };
}

/** Pure — nem ír storage-ba, csak a payloadot építi fel. */
export function serializeNavigationSession(input: {
  destination: PersistedNavigationDestination;
  displayedJourney: Journey;
  nowMs: number;
}): PersistedNavigationSession {
  return {
    schemaVersion: NAVIGATION_SESSION_SCHEMA_VERSION,
    savedAt: input.nowMs,
    navigationActive: true,
    destination: input.destination,
    displayedJourney: input.displayedJourney,
  };
}

function isValidPersistedDestination(value: unknown): value is PersistedNavigationDestination {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return false;
  if (v.latitude !== undefined && typeof v.latitude !== "number") return false;
  if (v.longitude !== undefined && typeof v.longitude !== "number") return false;
  return true;
}

function isValidJourneyLeg(value: unknown): value is JourneyLeg {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.mode === "WALK" || v.mode === "TRANSIT" || v.mode === "RENTAL") &&
    typeof v.fromName === "string" &&
    typeof v.toName === "string" &&
    typeof v.durationMinutes === "number"
  );
}

/** Csak a restore-hoz KRITIKUS top-level + journey struktúrát validáljuk — nem castolunk vakon. */
function isValidJourney(value: unknown): value is Journey {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.totalDurationMinutes !== "number") return false;
  if (typeof v.departureTime !== "string" || typeof v.arrivalTime !== "string") return false;
  if (!Array.isArray(v.legs) || v.legs.length === 0) return false;
  return v.legs.every(isValidJourneyLeg);
}

/**
 * Fail-closed validáció: JSON parse hiba, rossz schemaVersion, hiányzó
 * kötelező mező, túl régi session, navigationActive !== true, vagy
 * strukturálisan használhatatlan journey/destination esetén false — a
 * hívó ekkor NEM restore-ol, és törli a hibás bejegyzést (lásd
 * loadNavigationSession()).
 */
export function isValidPersistedNavigationSession(value: unknown, nowMs: number): value is PersistedNavigationSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== NAVIGATION_SESSION_SCHEMA_VERSION) return false;
  if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt)) return false;
  if (v.savedAt > nowMs + 60_000) return false; // jövőbeli timestamp (óra-eltérés) — gyanús, fail-closed
  if (nowMs - v.savedAt > NAVIGATION_SESSION_TTL_MS) return false; // lejárt (TTL)
  if (v.navigationActive !== true) return false;
  if (!isValidPersistedDestination(v.destination)) return false;
  if (!isValidJourney(v.displayedJourney)) return false;
  return true;
}

/**
 * Restore után a perzisztált realtime/transient mezők (delayMinutes,
 * cancelled, realTime, realtimeAvailable, leg.realtime) NEM tekinthetők
 * friss bizonyítéknak — konzervatív alapállapotra sanitizeljük, hogy a
 * MEGLÉVŐ useTransitRealtimeRefresh/realtime-refresh mechanizmus friss
 * adattal frissíthesse felül az exact tripId/routeId identitás alapján.
 * A tripId/routeId/fromStopId/toStopId (identitás) VÁLTOZATLAN marad —
 * ezekre van szükség a realtime-refresh pontos párosításához.
 */
export function sanitizeRestoredJourney(journey: Journey): Journey {
  return {
    ...journey,
    realTime: false,
    cancelled: false,
    realtimeAvailable: false,
    legs: journey.legs.map((leg) => ({
      ...leg,
      realtime: false,
      delayMinutes: undefined,
      cancelled: false,
    })),
  };
}

/** Az EGYETLEN write — best-effort, quota/disabled localStorage esetén csendben no-op. */
export function saveNavigationSession(session: PersistedNavigationSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAVIGATION_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage quota/disabled/private-mode — a navigáció ettől függetlenül működik.
  }
}

/** Fail-closed: bármilyen hiba/érvénytelen tartalom esetén null-t ad ÉS törli a bejegyzést. */
export function loadNavigationSession(nowMs: number): PersistedNavigationSession | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(NAVIGATION_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearNavigationSession();
    return null;
  }

  if (!isValidPersistedNavigationSession(parsed, nowMs)) {
    clearNavigationSession();
    return null;
  }

  return parsed;
}

export function clearNavigationSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NAVIGATION_SESSION_STORAGE_KEY);
  } catch {
    // no-op
  }
}
