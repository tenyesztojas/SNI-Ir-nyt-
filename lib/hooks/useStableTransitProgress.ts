"use client";
import { useEffect, useRef } from "react";
import { stabilizeTransitProgress } from "@/lib/vedett-route/navigation/stableTransitProgress";
import type { StableTransitProgress } from "@/lib/vedett-route/navigation/stableTransitProgress";
import type { TransitProgress } from "@/lib/vedett-route/navigation/transitProgress";

export function useStableTransitProgress(scope: string, candidate: TransitProgress | null, timestamp: number | null) {
  const previous = useRef<StableTransitProgress | null>(null);
  const next = stabilizeTransitProgress(previous.current, scope, candidate, timestamp);
  useEffect(() => { previous.current = next; }, [next]);
  return next.display;
}
