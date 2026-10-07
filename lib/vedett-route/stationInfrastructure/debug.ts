// VÉDETT ÚTVONAL — STATION INTELLIGENCE dev-only diagnosztika (2026-10-07).
// Productionben NEM logol. Csak kódok/számok — sosem GPS, user-, stop- vagy trip-azonosító.

export type StationGuidanceDebugEvent = "enrichment_skipped" | "enrichment_result" | "leg_guidance";

export function stationGuidanceDebugLog(event: StationGuidanceDebugEvent, details: Record<string, string | number | boolean | null>): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.debug(`[vedett-route:station-guidance] ${event}`, details);
  } catch {
    // no-op
  }
}
