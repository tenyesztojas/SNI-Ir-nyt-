// Védett Útvonal — strukturált technikai logging (27. pont).
//
// SOSEM logolhat: API-kulcsot, auth tokent, érzékeny profiladatot, teljes
// felhasználói személyes adatot. A redact() minden logolt objektumból
// eltávolítja az ismert érzékeny kulcsneveket, biztonsági hálóként — de a
// hívóknak eleve nem szabadna ilyesmit átadniuk.

const SENSITIVE_KEYS = ["key", "apikey", "api_key", "token", "authorization", "secret", "password"];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export type VedettRouteLogEvent =
  | "gtfs_static_refresh"
  | "gtfs_realtime_fetch"
  | "provider_error"
  | "routing_error"
  | "routing_engine_unavailable"
  | "timeout"
  | "malformed_response"
  | "connection_test"
  // NEARBY TRANSIT ACCESS — IDEIGLENES DIAGNOSZTIKAI SPRINT (2026-09-18,
  // 3. kör). Kizárólag vedettRouteNearbyDebugLog() hívja, KIZÁRÓLAG amikor
  // process.env.VEDETT_ROUTE_NEARBY_TRANSIT_DEBUG === "true" (lásd
  // vedettRouteNearbyDebugLog() lent) — normál productionben (flag nélkül)
  // EZ AZ EVENT SOHA nem kerül logolásra. Nem tartós logging — a root
  // cause bizonyítása után a hívási helyek (nem maga a típus/infra)
  // eltávolíthatók.
  | "nearby_transit_debug"
  // FOREGROUND REACQUISITION — SPRINT 8.1 (2026-09-18). Kizárólag
  // vedettRouteForegroundDebugLog() hívja, KIZÁRÓLAG amikor
  // process.env.VEDETT_ROUTE_FOREGROUND_DEBUG === "true" (lásd
  // vedettRouteForegroundDebugLog() lent) — normál productionben (flag
  // nélkül) EZ AZ EVENT SOHA nem kerül logolásra. A hívó (lásd
  // VedettUtvonalSearchForm.tsx foregroundReacquisition.ts wiring) KIZÁRÓLAG
  // checkpoint/phase/generation-t ad át — SOHA GPS-koordinátát.
  | "foreground_reacquisition_debug";

export function vedettRouteLog(
  event: VedettRouteLogEvent,
  level: "info" | "warn" | "error",
  details?: Record<string, unknown>
) {
  const entry = {
    module: "vedett-route",
    event,
    level,
    ts: new Date().toISOString(),
    ...(details ? { details: redact(details) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// IDEIGLENES DIAGNOSZTIKAI GATE (2026-09-18, NEARBY TRANSIT ACCESS 3.
// kör) — kizárólag a nearby-transit pipeline checkpointjait logolja,
// KIZÁRÓLAG amikor a VEDETT_ROUTE_NEARBY_TRANSIT_DEBUG env változó
// PONTOSAN "true" (alapértelmezés: KI, tehát production zajmentes marad,
// amíg valaki explicit be nem kapcsolja egy konkrét diagnosztikai
// keresésre). SOSEM logol GPS-koordinátát, felhasználói azonosítót vagy
// secretet — a hívók (lásd nearbyTransitAccess.ts/
// nearbyTransitJourneyCandidates.ts/orchestrator.ts) KIZÁRÓLAG
// stopId/name/distance/siker-e/route-metaadatot adnak át, a redact()
// biztonsági háló ettől függetlenül továbbra is aktív.
export function vedettRouteNearbyDebugLog(checkpoint: string, details: Record<string, unknown>) {
  if (process.env.VEDETT_ROUTE_NEARBY_TRANSIT_DEBUG !== "true") return;
  vedettRouteLog("nearby_transit_debug", "info", { checkpoint, ...details });
}

// IDEIGLENES DIAGNOSZTIKAI GATE (2026-09-18, FOREGROUND REACQUISITION,
// SPRINT 8.1) — kizárólag a foreground-reacquisition checkpointjait
// ("foreground_reacquisition_started"/"_stable"/"_cancelled") logolja,
// KIZÁRÓLAG amikor a VEDETT_ROUTE_FOREGROUND_DEBUG env változó PONTOSAN
// "true" (alapértelmezés: KI, production zajmentes marad). SOSEM logol
// GPS-koordinátát — a hívó KIZÁRÓLAG checkpoint/generation-t ad át, a
// redact() biztonsági háló ettől függetlenül továbbra is aktív.
export function vedettRouteForegroundDebugLog(checkpoint: string, details: Record<string, unknown>) {
  if (process.env.VEDETT_ROUTE_FOREGROUND_DEBUG !== "true") return;
  vedettRouteLog("foreground_reacquisition_debug", "info", { checkpoint, ...details });
}
