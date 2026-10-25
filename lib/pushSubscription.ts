// Web Push feliratkozás-kérések szerveroldali validálása (függőségmentes,
// tesztelhető). Az admin és a családi feliratkozás közös útja.

export interface ValidPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function parsePushEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  return raw;
}

export function parsePushSubscriptionBody(raw: unknown): ValidPushSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { endpoint?: unknown; keys?: unknown };
  const endpoint = parsePushEndpoint(r.endpoint);
  if (!endpoint || !r.keys || typeof r.keys !== "object") return null;
  const { p256dh, auth } = r.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== "string" || p256dh.length < 16 || p256dh.length > 200 || !B64URL.test(p256dh)) return null;
  if (typeof auth !== "string" || auth.length < 8 || auth.length > 100 || !B64URL.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

// Tulajdonosi döntések (a beküldött végpont SOSE ad jogot más user sorára).
export type SubscribeWrite = "insert" | "update" | "conflict";
export function decideSubscribeWrite(existingOwners: ReadonlyArray<string | null>, userId: string): SubscribeWrite {
  if (existingOwners.length === 0) return "insert";
  return existingOwners.every((o) => o === userId) ? "update" : "conflict";
}

export function classifySyncOwner(existingOwners: ReadonlyArray<string | null>, userId: string): { linked: boolean; stale: boolean } {
  if (existingOwners.length === 0) return { linked: false, stale: false };
  const linked = existingOwners.every((o) => o === userId);
  return { linked, stale: !linked };
}
