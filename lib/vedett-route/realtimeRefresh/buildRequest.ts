// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — PURE (hálózat nélküli)
// request-építő, ugyanazt a mintát követi, mint
// restStopFlow/rerouteRequest.ts.
//
// SZÁNDÉKOSAN a Journey SAJÁT tervezett origin/destination/departAt
// koordinátáit használja (nem a felhasználó jelenlegi GPS pozícióját) —
// a cél a MÁR MEGTERVEZETT út friss realtime állapotának lekérdezése, nem
// egy újratervezés a jelenlegi helyről (lásd resume/rerouteRequest.ts, ami
// pont ezt csinálja, más célból).

import type { MotisPlanParams } from "../motisTypes.ts";

export interface RealtimeRefreshContext {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  departAt: string;
}

export function buildRealtimeRefreshRequest(
  context: RealtimeRefreshContext,
  numItineraries = 3
): MotisPlanParams {
  return {
    fromPlace: `${context.from.lat},${context.from.lon}`,
    toPlace: `${context.to.lat},${context.to.lon}`,
    time: context.departAt,
    numItineraries,
  };
}
