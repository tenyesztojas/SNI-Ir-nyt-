"use client";

import { useEffect, useRef, useState } from "react";
import { createInitialRouteProgress, updateRouteProgress } from "@/lib/vedett-route/navigation/routeProgress";
import type { NavigationCoordinate, NavigationPosition, RouteProgressOptions, RouteProgressState } from "@/lib/vedett-route/navigation/types";

export function useRouteNavigation(
  routeCoordinates: readonly NavigationCoordinate[],
  position: NavigationPosition | null,
  options: RouteProgressOptions = {},
): RouteProgressState {
  const [state, setState] = useState<RouteProgressState>(() => createInitialRouteProgress());
  const previousRef = useRef<RouteProgressState | null>(null);

  useEffect(() => {
    previousRef.current = null;
    setState(createInitialRouteProgress());
  }, [routeCoordinates]);

  useEffect(() => {
    if (!position || routeCoordinates.length < 2) return;
    const next = updateRouteProgress(routeCoordinates, position, previousRef.current, options);
    previousRef.current = next;
    setState(next);
  }, [position, routeCoordinates, options.onRouteThresholdMeters, options.offRouteThresholdMeters, options.offRouteConfirmFixes, options.backwardToleranceMeters, options.routeDurationSeconds]);

  return state;
}
