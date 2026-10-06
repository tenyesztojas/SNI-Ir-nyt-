// VÉDETT ÚTVONAL — REALTIME COMMUNITY INTELLIGENCE — privacy-preserving dedup token.
//
// CÉL: ugyanaz a beküldő (user vagy IP) ugyanarra a célpontra (trip / route+
// szakasz / route / cella) rövid időn belül adott több jelzése EGY független
// megerősítésnek számítson — tartós azonosító NÉLKÜL.
//
// KÉPZÉS: token = HMAC-SHA256(secret, actor | időablak | scope)[0..16 hex]
//   - actor: a MEGLÉVŐ rate-limit szereplő-kulcs ("u:<userId>" / "ip:<ip>") —
//     a nyers értéket SOHA nem tároljuk, csak a HMAC-ot;
//   - időablak: 3 órás UTC ablak sorszáma -> ablakonként új token;
//   - scope: a jelzés célpontja (trip_id, különben route+szakasz, route,
//     geo_cell, "none") -> két KÜLÖNBÖZŐ járaton tett jelzés tokenje eltér,
//     tehát a token nem fűzi össze egy ember jelzéseit útvonallá;
//   - secret: VEDETT_ROUTE_COMMUNITY_DEDUP_SECRET env; hiányában folyamatonként
//     véletlen kulcs (minden újraindulás/instance rotálja — gyengébb dedup, de
//     soha nem gyengébb privacy).
// TÁROLÁS: vedett_route_community_reports.reporter_scope_token (nullable).
// KIADÁS: SOHA nem kerül API-válaszba, logba vagy historikus aggregátumba.
// ÉLETTARTAM: a migráció purge-függvénye a report lejárata után nullázza.
// MIÉRT NEM TRACKING-ALKALMAS: secret nélkül nem visszafejthető; ablakonként és
// célpontonként más; nem köt össze különböző járatokat vagy napokat; lejárat
// után törölhető.

import { createHmac, randomBytes } from "node:crypto";

export const REPORTER_TOKEN_WINDOW_MS = 3 * 60 * 60_000;
export const REPORTER_TOKEN_HEX_LENGTH = 16;

const processSecret = randomBytes(32).toString("hex");

function dedupSecret(): string {
  const configured = process.env.VEDETT_ROUTE_COMMUNITY_DEDUP_SECRET;
  return configured && configured.length >= 16 ? configured : processSecret;
}

export interface ReporterTokenScopeInput {
  tripId?: string | null;
  routeId?: string | null;
  segmentKey?: string | null;
  geoCell?: string | null;
}

export function reporterTokenScope(input: ReporterTokenScopeInput): string {
  if (input.tripId) return `trip:${input.tripId}`;
  if (input.routeId && input.segmentKey) return `route_seg:${input.routeId}|${input.segmentKey}`;
  if (input.routeId) return `route:${input.routeId}`;
  if (input.geoCell) return `cell:${input.geoCell}`;
  return "none";
}

export function computeReporterScopeToken(actor: string, scope: ReporterTokenScopeInput, now: Date, secret: string = dedupSecret()): string {
  const window = Math.floor(now.getTime() / REPORTER_TOKEN_WINDOW_MS);
  return createHmac("sha256", secret)
    .update(`${actor}|${window}|${reporterTokenScope(scope)}`)
    .digest("hex")
    .slice(0, REPORTER_TOKEN_HEX_LENGTH);
}
