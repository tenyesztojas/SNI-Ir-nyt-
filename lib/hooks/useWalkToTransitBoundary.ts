"use client";

import { useEffect, useRef, useState } from "react";
import type { WalkToTransitBoundaryInput } from "@/lib/vedett-route/navigation/legTransition";
import { advanceTransitJourneySession, confirmJourneyAlighting, createTransitJourneySession } from "@/lib/vedett-route/navigation/transitJourneySession";
import type { SessionTransitLeg } from "@/lib/vedett-route/navigation/transitJourneySession";

export function useWalkToTransitBoundary(
  input: WalkToTransitBoundaryInput,
  resetKey: unknown,
  transitLegs: readonly SessionTransitLeg[],
  timestampMs: number | null,
) {
  const [snapshot, setSnapshot] = useState(() => ({ key: resetKey, session: createTransitJourneySession() }));
  const snapshotRef = useRef(snapshot);
  const { geometryActiveLegIndex, geometryActiveLegMode, position, offRouteStatus } = input;
  useEffect(() => {
    const previous = snapshotRef.current.key === resetKey ? snapshotRef.current.session : createTransitJourneySession();
    const session = advanceTransitJourneySession(previous, {
      geometryActiveLegIndex, geometryActiveLegMode, position, offRouteStatus, nextTransitLeg: null, previous: null,
    }, transitLegs, timestampMs);
    if (session === snapshotRef.current.session && snapshotRef.current.key === resetKey) return;
    snapshotRef.current = { key: resetKey, session };
    setSnapshot(snapshotRef.current);
  }, [resetKey, geometryActiveLegIndex, geometryActiveLegMode, position, offRouteStatus, transitLegs, timestampMs]);

  // Do not render a previous route's active ride while its reset effect is pending.
  const session = snapshot.key === resetKey ? snapshot.session : createTransitJourneySession();
  const scope = session.trackedLeg?.scope;
  const confirmAlighting = () => {
    if (!scope || snapshotRef.current.key !== resetKey) return false;
    const previous = snapshotRef.current.session;
    const next = confirmJourneyAlighting(previous, scope);
    if (next === previous) return false;
    snapshotRef.current = { key: resetKey, session: next };
    setSnapshot(snapshotRef.current);
    return true;
  };
  return { ...session.boundary, alightingReady: session.alightingReady, journeyComplete: session.journeyComplete, confirmAlighting };
}
