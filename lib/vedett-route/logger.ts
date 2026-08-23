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
  | "connection_test";

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
