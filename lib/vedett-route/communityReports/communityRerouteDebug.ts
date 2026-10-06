// DYNAMIC SENSORY REROUTING — fejlesztői diagnosztika (KIZÁRÓLAG nem-production
// buildben ír). Csak döntési okok és pontszámok — soha GPS, útvonal-előzmény,
// preferencia-érték vagy személyes adat.
export type CommunityRerouteDebugEvent = "baseline_set" | "suppressed_after_decline" | "deterioration_check" | "reroute_decision";

export function communityRerouteDebugLog(event: CommunityRerouteDebugEvent, details: Record<string, string | number | boolean | null>): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.debug(`[vedett-route:community-reroute] ${event}`, details);
  } catch {
    // no-op
  }
}
