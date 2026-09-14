export type LngLat = [number, number];

export type CarRouteGeometry = {
  type: "LineString";
  coordinates: LngLat[];
};

export type CarManeuver = {
  type: string;
  modifier?: string;
  instruction: string;
  location: LngLat;
  bearingBefore?: number;
  bearingAfter?: number;
  exit?: number;
};

export type CarVoiceInstruction = {
  distanceAlongGeometryMeters: number;
  announcement: string;
  ssmlAnnouncement?: string;
};

export type CarBannerInstruction = {
  distanceAlongGeometryMeters: number;
  primaryText?: string;
  secondaryText?: string;
  subText?: string;
};

export type CarIntersection = {
  location: LngLat;
  trafficSignal: boolean;
  stopSign: boolean;
  yieldSign: boolean;
  railwayCrossing: boolean;
  classes: string[];
};

export type CarNavigationStep = {
  distanceMeters: number;
  durationSeconds: number;
  typicalDurationSeconds?: number;
  roadName?: string;
  roadRef?: string;
  destinations?: string;
  exits?: string;
  drivingSide?: "left" | "right";
  mode?: string;
  maneuver: CarManeuver;
  geometry?: CarRouteGeometry;
  intersections: CarIntersection[];
  voiceInstructions: CarVoiceInstruction[];
  bannerInstructions: CarBannerInstruction[];
};

export type CarSegmentMaxSpeed = {
  speedKmh?: number;
  unknown: boolean;
  unlimited: boolean;
};

export type CarLegAnnotations = {
  distanceMeters: number[];
  durationSeconds: number[];
  speedMetersPerSecond: Array<number | null>;
  congestion: Array<string | null>;
  congestionNumeric: Array<number | null>;
  maxSpeed: CarSegmentMaxSpeed[];
};

export type CarNavigationLeg = {
  distanceMeters: number;
  durationSeconds: number;
  typicalDurationSeconds?: number;
  summary?: string;
  steps: CarNavigationStep[];
  annotations: CarLegAnnotations;
};

export type CarSensoryFeatures = {
  totalDistanceMeters: number;
  durationSeconds: number;
  typicalDurationSeconds?: number;

  congestionKnownDistanceMeters: number;
  congestionWeightedMean: number;
  congestedDistanceRatio: number;
  liveVsTypicalDelayRatio: number;

  maneuverCount: number;
  turnsPerKm: number;
  sharpTurnCount: number;
  uTurnCount: number;
  roundaboutCount: number;
  exitCount: number;
  rapidInstructionSequenceCount: number;

  intersectionCount: number;
  trafficSignalCount: number;
  stopSignCount: number;
  yieldSignCount: number;
  railwayCrossingCount: number;

  maxKnownSpeedKmh?: number;
  highSpeedDistanceRatio: number;
};

export type CarSensoryComponents = {
  trafficStress: number;
  maneuverLoad: number;
  roadComplexity: number;
  speedStress: number;
  uncertainty: number;
};

export type CarSensoryScore = {
  version: "car-sensory-v1";
  experimental: true;
  score: number;
  components: CarSensoryComponents;
  features: CarSensoryFeatures;
};

export type CarNavigationRoute = {
  durationSeconds: number;
  typicalDurationSeconds?: number;
  distanceMeters: number;
  geometry: CarRouteGeometry;
  legs: CarNavigationLeg[];
  sensory: CarSensoryScore;
};

export type RawMapboxVoiceInstruction = {
  distanceAlongGeometry?: unknown;
  announcement?: unknown;
  ssmlAnnouncement?: unknown;
};

export type RawMapboxBannerComponent = {
  text?: unknown;
};

export type RawMapboxBannerInstruction = {
  distanceAlongGeometry?: unknown;
  primary?: RawMapboxBannerComponent;
  secondary?: RawMapboxBannerComponent;
  sub?: RawMapboxBannerComponent;
};

export type RawMapboxIntersection = {
  location?: unknown;
  traffic_signal?: unknown;
  stop_sign?: unknown;
  yield_sign?: unknown;
  railway_crossing?: unknown;
  classes?: unknown;
};

export type RawMapboxManeuver = {
  type?: unknown;
  modifier?: unknown;
  instruction?: unknown;
  location?: unknown;
  bearing_before?: unknown;
  bearing_after?: unknown;
  exit?: unknown;
};

export type RawMapboxStep = {
  distance?: unknown;
  duration?: unknown;
  duration_typical?: unknown;
  name?: unknown;
  ref?: unknown;
  destinations?: unknown;
  exits?: unknown;
  driving_side?: unknown;
  mode?: unknown;
  maneuver?: RawMapboxManeuver;
  geometry?: { type?: unknown; coordinates?: unknown };
  intersections?: RawMapboxIntersection[];
  voiceInstructions?: RawMapboxVoiceInstruction[];
  bannerInstructions?: RawMapboxBannerInstruction[];
};

export type RawMapboxMaxSpeed = {
  speed?: unknown;
  unit?: unknown;
  unknown?: unknown;
  none?: unknown;
};

export type RawMapboxAnnotation = {
  distance?: unknown;
  duration?: unknown;
  speed?: unknown;
  congestion?: unknown;
  congestion_numeric?: unknown;
  maxspeed?: unknown;
};

export type RawMapboxLeg = {
  distance?: unknown;
  duration?: unknown;
  duration_typical?: unknown;
  summary?: unknown;
  steps?: RawMapboxStep[];
  annotation?: RawMapboxAnnotation;
};

export type RawMapboxRoute = {
  duration?: unknown;
  duration_typical?: unknown;
  distance?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown };
  legs?: RawMapboxLeg[];
};
