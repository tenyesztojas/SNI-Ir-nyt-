// lib/vedett-route/streetLevelFallbackState.ts
//
// Pure, React-független állapotgép a street-level house_number_not_resolved
// fallback megerősítési folyamatához. Kiszervezve a tesztelhetőség érdekéből
// a VedettUtvonalSearchForm.tsx inline handler-logikájából.
//
// ÁLLAPOT-ÁTMENETEK (spec, 2026-09-12):
//
//   [1] house_number_not_resolved API válasz
//       → processHouseNumberNotResolved()
//       → PENDING_CONFIRMATION (pendingStreetLevelResubmit = false)
//       HATÁS: UI inline kártyát mutat, routing NEM indul automatikusan
//
//   [2] Felhasználó: "Az utca közelítő helyével tervezek"
//       → acceptStreetLevel(pending)
//       → ACCEPTED (pendingStreetLevelResubmit = true, mapPickedDestination = MAP_PICKED)
//       HATÁS: React useEffect → formRef.current?.requestSubmit()
//             → buildSearchRequestDestinationFields(MAP_PICKED) → toCoordinates
//             → szerver NEM hívja a geocodeAddress()-t → routing indul
//
//   [3] Felhasználó: "Módosítom a címet"
//       → modifyStreetLevel()
//       → DISMISSED (pendingStreetLevelResubmit = false)
//       HATÁS: UI kártya eltűnik, cím-mező szerkeszthetővé válik, routing NEM indul
//
// INVARIÁNSOK (tesztelve a __tests__-ben):
//   - PENDING_CONFIRMATION.pendingStreetLevelResubmit === false (nincs auto-submit)
//   - ACCEPTED.pendingStreetLevelResubmit === true (submit trigger aktív)
//   - ACCEPTED.mapPickedDestination.type === "MAP_PICKED" (koordináta-alapú routing)
//   - DISMISSED.pendingStreetLevelResubmit === false (nincs auto-submit)
//
// BIZTONSÁGI SZABÁLYOK (megőrzöttek):
//   - A MANUAL state-ből a routing sosem indul automatikusan
//   - buildSearchRequestDestinationFields(MAP_PICKED) → toCoordinates (nem re-geokódol)
//   - buildSearchRequestDestinationFields(MANUAL) → to: string (geocodeAddress hívódik)

import type { RouteDestinationMapPicked } from "./searchRequestBuilder";

// ─── Típusok ─────────────────────────────────────────────────────────────────

/** A house_number_not_resolved API válaszból kinyert közelítő helyadatok. */
export type ApproximateStreetLocation = {
  name: string;
  lat: number;
  lon: number;
  resolvedStreet?: string;
  resolvedCity?: string;
};

/**
 * PENDING_CONFIRMATION — a felhasználó megkapta a house_number_not_resolved
 * kártyát, de még nem hozta meg a döntést. Routing NEM indul automatikusan
 * (pendingStreetLevelResubmit === false).
 */
export type StreetLevelPendingState = {
  status: "PENDING_CONFIRMATION";
  field: "to" | "from";
  approximateLocation: ApproximateStreetLocation;
  pendingStreetLevelResubmit: false;
};

/**
 * ACCEPTED — a felhasználó az "Az utca közelítő helyével tervezek" gombot
 * nyomta. A mapPickedDestination MAP_PICKED koordinátával készen áll a
 * routing indításra. pendingStreetLevelResubmit === true: React useEffect
 * → requestSubmit() triggereli a re-submitot.
 */
export type StreetLevelAcceptedState = {
  status: "ACCEPTED";
  pendingStreetLevelResubmit: true;
  mapPickedDestination: RouteDestinationMapPicked;
};

/**
 * DISMISSED — a felhasználó a "Módosítom a címet" gombot nyomta.
 * A hibaállapot törlődik, a cím-mező szerkeszthetővé válik.
 * Routing NEM indul (pendingStreetLevelResubmit === false).
 */
export type StreetLevelDismissedState = {
  status: "DISMISSED";
  pendingStreetLevelResubmit: false;
};

export type StreetLevelFallbackState =
  | StreetLevelPendingState
  | StreetLevelAcceptedState
  | StreetLevelDismissedState;

// ─── Állapot-átmenet függvények ───────────────────────────────────────────────

/**
 * Feldolgozza a house_number_not_resolved API választ.
 * Megfelel a VedettUtvonalSearchForm.tsx setStreetLevelTo/From hívásának.
 * Visszaad egy PENDING_CONFIRMATION állapotot — routing NEM indul.
 */
export function processHouseNumberNotResolved(
  field: "to" | "from",
  approximateLocation: ApproximateStreetLocation
): StreetLevelPendingState {
  return {
    status: "PENDING_CONFIRMATION",
    field,
    approximateLocation,
    pendingStreetLevelResubmit: false,
  };
}

/**
 * "Az utca közelítő helyével tervezek" gomb megnyomása.
 * Megfelel a handleStreetLevelAcceptTo / handleStreetLevelAcceptFrom logikának:
 *   - setDestination({ type: "MAP_PICKED", ... })
 *   - setPendingStreetLevelResubmit(true)
 * A mapPickedDestination.type === "MAP_PICKED" → buildSearchRequestDestinationFields
 * toCoordinates-t fog küldeni (nem re-geokódol).
 */
export function acceptStreetLevel(
  pending: StreetLevelPendingState
): StreetLevelAcceptedState {
  const { approximateLocation } = pending;
  const label =
    [approximateLocation.resolvedStreet, approximateLocation.resolvedCity]
      .filter(Boolean)
      .join(", ") || "Utca közelítő helye";
  return {
    status: "ACCEPTED",
    pendingStreetLevelResubmit: true,
    mapPickedDestination: {
      type: "MAP_PICKED",
      name: label,
      latitude: approximateLocation.lat,
      longitude: approximateLocation.lon,
    },
  };
}

/**
 * "Módosítom a címet" gomb megnyomása.
 * Megfelel a handleStreetLevelModifyTo / handleStreetLevelModifyFrom logikának:
 *   - setStreetLevelTo/From(null) → street-level state törlése
 *   - setResult(null) → hibaállapot törlése
 * pendingStreetLevelResubmit === false → nincs auto-submit.
 */
export function modifyStreetLevel(): StreetLevelDismissedState {
  return {
    status: "DISMISSED",
    pendingStreetLevelResubmit: false,
  };
}
