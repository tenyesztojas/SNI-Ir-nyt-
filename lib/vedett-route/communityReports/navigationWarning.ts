// VÉDETT ÚTVONAL — REALTIME COMMUNITY INTELLIGENCE — navigációs figyelmeztetés kiválasztása.
//
// Tiszta függvény, hiszterézissel: egy figyelmeztetés csak magas confidence-nél
// (és ≥ 2 független jelzésnél) JELENIK MEG, de csak jóval alacsonyabb értéknél
// TŰNIK EL — így két polling között nem villog. Gyenge adatból nincs állítás.

import { NAVIGATION_WARNING_CONFIG, type RealtimeStateKind } from "./realtimeConfig.ts";
import type { CommunityRealtimeState } from "./realtimeEngine.ts";

export const NAVIGATION_WARNING_MESSAGES: Record<RealtimeStateKind, { icon: string; text: string }> = {
  traffic_jam: { icon: "🚧", text: "Dugót jeleztek ezen a szakaszon." },
  vehicle_stopped: { icon: "⏸", text: "Megállt járművet jeleztek ezen a szakaszon." },
  service_problem: { icon: "⚠️", text: "Közlekedési problémát jeleztek ezen a vonalon." },
  crowding: { icon: "👥", text: "Zsúfoltságot jeleztek ezen a járaton." },
  noisy: { icon: "🔊", text: "Erős zajt jeleztek ezen a járaton." },
  bright_light: { icon: "💡", text: "Zavaró fényt jeleztek ezen a járaton." },
  vibration: { icon: "〰️", text: "Erős rázkódást jeleztek ezen a járaton." },
  too_hot: { icon: "🌡️", text: "Meleget jeleztek ezen a járaton." },
};

export interface NavigationCommunityWarning {
  kind: RealtimeStateKind;
  icon: string;
  text: string;
}

function eligible(state: CommunityRealtimeState, minConfidence: number): boolean {
  return (
    state.confidence >= minConfidence &&
    state.independentReportCount >= NAVIGATION_WARNING_CONFIG.minIndependentReports &&
    NAVIGATION_WARNING_CONFIG.allowedMatchLevels.includes(state.matchLevel)
  );
}

export function selectNavigationCommunityWarning(
  states: readonly CommunityRealtimeState[],
  previousKind: RealtimeStateKind | null
): NavigationCommunityWarning | null {
  // A már látható figyelmeztetés marad, amíg az elrejtési küszöb fölött van.
  if (previousKind) {
    const previous = states.find((s) => s.kind === previousKind);
    if (previous && eligible(previous, NAVIGATION_WARNING_CONFIG.hideBelowConfidence)) {
      return { kind: previousKind, ...NAVIGATION_WARNING_MESSAGES[previousKind] };
    }
  }
  const candidate = [...states]
    .filter((s) => eligible(s, NAVIGATION_WARNING_CONFIG.showMinConfidence))
    .sort((a, b) => b.confidence - a.confidence || (a.kind < b.kind ? -1 : 1))[0];
  return candidate ? { kind: candidate.kind, ...NAVIGATION_WARNING_MESSAGES[candidate.kind] } : null;
}
