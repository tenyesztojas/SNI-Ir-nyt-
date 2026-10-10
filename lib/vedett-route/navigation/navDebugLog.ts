// NAVIGÁCIÓS DIAGNOSZTIKA (2026-10-10) — csak fejlesztői/debug környezetben
// (NODE_ENV !== "production"), vagy ha a böngésző helyi tárolójában a
// "vedett-route:nav-debug" kulcs értéke "1". Adatvédelem: csak esemény-
// név + zárt, primitív részletek; koordináta-jellegű kulcs SOHA nem kerül
// a naplóba (a szűrő eldobja), és a hívók sem adnak át pozíciót.

export const NAV_DEBUG_STORAGE_KEY = "vedett-route:nav-debug";
const FORBIDDEN_KEY = /lat|lon|lng|coord|position|accuracy|heading|address/i;

type Detail = string | number | boolean | null | undefined;

export function sanitizeNavDebugDetails(details: Record<string, Detail> = {}): Record<string, Detail> {
  const out: Record<string, Detail> = {};
  for (const [k, v] of Object.entries(details)) {
    if (FORBIDDEN_KEY.test(k)) continue;
    if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function isNavDebugEnabled(): boolean {
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") return true;
    return typeof window !== "undefined" && window.localStorage?.getItem(NAV_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function navDebugLog(event: string, details?: Record<string, Detail>): void {
  if (!isNavDebugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.info("[VedettNav]", event, sanitizeNavDebugDetails(details));
  } catch {
    // no-op
  }
}
