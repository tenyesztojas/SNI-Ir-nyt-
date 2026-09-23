import { haversineMeters } from "./geometry.ts";
import { createInitialWalkToTransitBoundaryState, resolveWalkToTransitBoundary } from "./legTransition.ts";
import type { WalkToTransitBoundaryInput, WalkToTransitBoundaryState, WalkToTransitNextTransitLeg } from "./legTransition.ts";

export type SessionTransitLeg = WalkToTransitNextTransitLeg & { scope: string };
export interface TransitJourneySession {
  boundary: WalkToTransitBoundaryState;
  trackedLeg: SessionTransitLeg | null;
  completedThrough: number;
  lastFixTimestamp: number | null;
  alightingReady: boolean;
  journeyComplete: boolean;
}
export function createTransitJourneySession(): TransitJourneySession {
  return { boundary: createInitialWalkToTransitBoundaryState(), trackedLeg: null,
    completedThrough: -1, lastFixTimestamp: null, alightingReady: false, journeyComplete: false };
}
export function isBoardedBoundary(boundary: WalkToTransitBoundaryState): boolean {
  return boundary.phase === "BOARDED" || boundary.phase === "BOARDED_UNCERTAIN_GEOMETRY";
}

// Arrival at a platform does not prove alighting. Keep the active ride until
// explicit confirmation, independently of global geometry and stop-list quality.
export function advanceTransitJourneySession(
  previous: TransitJourneySession,
  input: WalkToTransitBoundaryInput,
  legs: readonly SessionTransitLeg[],
  timestampMs: number | null,
): TransitJourneySession {
  if (previous.journeyComplete) return previous;
  const floor = previous.completedThrough + 1;
  const geometryIndex = Math.max(floor, input.geometryActiveLegIndex ?? floor);
  const pinned = isBoardedBoundary(previous.boundary) ? previous.trackedLeg : null;
  const leg = pinned
    ? legs.find(l => l.legIndex === pinned.legIndex && l.scope === pinned.scope) ?? null
    : legs.find(l => l.legIndex >= geometryIndex) ?? null;
  const sameLeg = leg !== null && previous.trackedLeg?.scope === leg.scope && previous.trackedLeg.legIndex === leg.legIndex;
  const freshFix = timestampMs !== null && Number.isFinite(timestampMs) &&
    (previous.lastFixTimestamp === null || timestampMs > previous.lastFixTimestamp);
  if (!freshFix && sameLeg) {
    if (!input.position && !previous.alightingReady && previous.boundary.arrivalEvidenceFixes > 0) {
      return { ...previous, boundary: { ...previous.boundary, arrivalEvidenceFixes: 0 } };
    }
    return previous;
  }
  const previousBoundary = sameLeg ? previous.boundary : null;
  const effectiveIndex = pinned && sameLeg ? leg!.legIndex : geometryIndex;
  const boundary = resolveWalkToTransitBoundary({
    ...input,
    geometryActiveLegIndex: effectiveIndex,
    // Continue collecting boarding evidence even when the map already labels
    // this segment TRANSIT. A pinned ride cannot be replaced by a GPS jump.
    geometryActiveLegMode: leg && (sameLeg && pinned || input.geometryActiveLegMode === "TRANSIT" || effectiveIndex !== input.geometryActiveLegIndex)
      ? "WALK" : input.geometryActiveLegMode,
    nextTransitLeg: leg ? { ...leg, hasFollowingLeg: false } : null,
    position: freshFix ? input.position : null,
    previous: previousBoundary,
  });
  let arrivalEvidenceFixes = sameLeg ? previous.boundary.arrivalEvidenceFixes : 0;
  // Starting navigation midway through a ride may miss boarding evidence.
  // Map context can offer an explicit confirmation, but can never complete it.
  const canOfferAlighting = isBoardedBoundary(boundary) ||
    (input.geometryActiveLegMode === "TRANSIT" && input.geometryActiveLegIndex === leg?.legIndex);
  if (freshFix && input.position) {
    const { latitude, longitude, accuracyMeters } = input.position;
    const destination = leg?.alightingCoordinate;
    const valid = Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 &&
      typeof accuracyMeters === "number" && Number.isFinite(accuracyMeters) && accuracyMeters >= 0 && accuracyMeters <= 50 &&
      destination && Number.isFinite(destination[0]) && Math.abs(destination[0]) <= 180 && Number.isFinite(destination[1]) && Math.abs(destination[1]) <= 90;
    const near = valid && haversineMeters([longitude, latitude], destination) + accuracyMeters <= 35;
    arrivalEvidenceFixes = canOfferAlighting && near ? arrivalEvidenceFixes + 1 : 0;
  }
  return { ...previous, boundary: { ...boundary, arrivalEvidenceFixes }, trackedLeg: leg,
    lastFixTimestamp: freshFix ? timestampMs : previous.lastFixTimestamp,
    alightingReady: canOfferAlighting && arrivalEvidenceFixes >= 3 };
}

export function confirmJourneyAlighting(state: TransitJourneySession, scope: string): TransitJourneySession {
  if (!state.alightingReady || !state.trackedLeg || state.trackedLeg.scope !== scope) return state;
  const leg = state.trackedLeg;
  return { ...state, trackedLeg: null, completedThrough: leg.legIndex, alightingReady: false,
    journeyComplete: !leg.hasFollowingLeg,
    boundary: { ...createInitialWalkToTransitBoundaryState(), phase: "ARRIVED",
      resolvedLegIndex: leg.hasFollowingLeg ? leg.legIndex + 1 : leg.legIndex } };
}
