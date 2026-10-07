// VÉDETT ÚTVONAL — STATION GUIDANCE (UI-független, kliensbiztos típusok) (2026-10-07)
//
// A szerver a route search válaszában, a TRANSIT lábhoz csatolva adja át
// (JourneyLeg.stationGuidance) — a láb LESZÁLLÁSI állomására vonatkozik.
// NEM tartalmaz nyers GTFS azonosítót, felhasználói adatot vagy GPS-t;
// csak kódokat, bizonyosságot, címkét és állomás-csomópont koordinátát.

export type StationGuidanceConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type StationCapabilityCode = "NONE" | "GEOMETRY_ONLY" | "GRAPH_PARTIAL" | "GRAPH_USABLE" | "GRAPH_WITH_LIFT";

export type StationAccessibilityCode = "STEP_FREE_CONFIRMED" | "HAS_LIFT" | "ACCESSIBILITY_UNKNOWN";

export type StationExitReasonCode =
  | "BEST_EXIT_FOR_TRANSFER"
  | "BEST_EXIT_FOR_DESTINATION"
  | "SHORTER_STATION_PATH"
  | "SHORTER_WALK_AFTER_EXIT"
  | "LIFT_PATH_AVAILABLE"
  | "STEP_FREE_PATH_AVAILABLE"
  | "EXPLICIT_GTFS_PATHWAY"
  | "GEOMETRIC_EXIT_TARGET";

export type StationTransferReasonCode = "EXPLICIT_GTFS_PATHWAY" | "LIFT_PATH_AVAILABLE" | "STEP_FREE_PATH_AVAILABLE";

export type StationGuidanceStatus =
  | "EXIT_SELECTED"
  | "TRANSFER_PATH"
  | "NO_STATION_GRAPH"
  | "GRAPH_PARTIAL"
  | "NO_TARGET"
  | "NO_CONNECTED_EXIT";

export type StationTargetBasis = "WALK_DESTINATION" | "WALK_PATH_GEOMETRY" | "STRAIGHT_LINE_TARGET" | "NEXT_STOP_COORDINATE";

/** Mi alapján rangsoroltuk a kijáratokat: valódi gyalogos útvonal (MOTIS foot) vagy légvonal. */
export type StationExitRankingBasis = "WALKING_ROUTE" | "STRAIGHT_LINE";

export interface StationExitRecommendation {
  /** Ember számára értelmes, szanitizált kijárat-címke (pl. "A"); nincs -> null. */
  label: string | null;
  confidence: StationGuidanceConfidence;
  reasonCodes: StationExitReasonCode[];
  /** Csak teljesen explicit traversal_time esetén; becsült költségnél null. */
  internalTraversalSeconds: number | null;
  targetDistanceMeters: number | null;
  accessibility: StationAccessibilityCode;
  targetBasis: StationTargetBasis;
  /** RECOMMENDED METRO EXITS v1 (2026-10-07). Hiányzó mező (régi válasz) = légvonal. */
  rankingBasis?: StationExitRankingBasis;
  /** Csak valódi gyalogos routing esetén: kijárat -> cél gyaloglás (MOTIS foot). */
  walkingRoute?: { durationSeconds: number; distanceMeters: number } | null;
}

export interface StationTransferGuidance {
  confidence: StationGuidanceConfidence;
  reasonCodes: StationTransferReasonCode[];
  /** Csak teljesen explicit traversal_time esetén; különben null. */
  traversalSeconds: number | null;
  liftAvailable: boolean;
  accessibility: StationAccessibilityCode;
}

export interface StationBoardingTarget {
  lat: number;
  lon: number;
  basis: "STATION_PATHWAY_NODE";
  targetType: "TRANSFER" | "DESTINATION";
}

export interface LegStationGuidance {
  schemaVersion: 1;
  status: StationGuidanceStatus;
  capability: StationCapabilityCode;
  /** Több szülőállomást összekötő csomópont (pl. többvonalas átszálló). */
  interchangeComplex: boolean;
  stationPathConfidence: StationGuidanceConfidence;
  exit?: StationExitRecommendation;
  transfer?: StationTransferGuidance;
  boardingTarget?: StationBoardingTarget;
}
