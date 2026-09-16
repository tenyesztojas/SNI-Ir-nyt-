"use client";

// SPRINT 7.1 (2026-09-16) — thin, stateful React wrapper a pure
// lib/vedett-route/navigation/legTransition.ts resolver körül. UGYANAZ a
// minta, mint lib/hooks/useRouteNavigation.ts: reset a route/aktív-navigáció
// váltásakor (elkerülve a "stale boarding-hiszterézis egy ÚJ útvonalon"
// problémát), különben minden position/activeLeg-változásra újraszámol,
// a hiszterézis-számlálót egy ref-ben tartva a fixek között.

import { useEffect, useRef, useState } from "react";
import {
  createInitialWalkToTransitBoundaryState,
  resolveWalkToTransitBoundary,
} from "@/lib/vedett-route/navigation/legTransition";
import type { WalkToTransitBoundaryInput, WalkToTransitBoundaryState } from "@/lib/vedett-route/navigation/legTransition";

export function useWalkToTransitBoundary(
  input: WalkToTransitBoundaryInput,
  // Reset-kulcs: amikor ez változik (pl. új navigationRouteCoordinates
  // referencia vagy navigationMode ki/be), a hiszterézis-állapot friss
  // (createInitialWalkToTransitBoundaryState()) — ugyanaz a reset-elv, mint
  // useRouteNavigation.ts-ben.
  resetKey: unknown,
): WalkToTransitBoundaryState {
  const [state, setState] = useState<WalkToTransitBoundaryState>(() => createInitialWalkToTransitBoundaryState());
  const previousRef = useRef<WalkToTransitBoundaryState | null>(null);

  useEffect(() => {
    previousRef.current = null;
    setState(createInitialWalkToTransitBoundaryState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const next = resolveWalkToTransitBoundary({ ...input, previous: previousRef.current });
    previousRef.current = next;
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resetKey,
    input.geometryActiveLegIndex,
    input.geometryActiveLegMode,
    input.nextTransitLeg,
    input.position,
    input.offRouteStatus,
  ]);

  return state;
}
