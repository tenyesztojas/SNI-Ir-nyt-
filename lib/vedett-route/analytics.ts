// Védett Útvonal — privacy-safe GA4 mérés. A KÖZPONTI belépési pont: a
// trackVedettRouteEvent() szerkezetileg NEM fogad tetszőleges objektumot,
// csak előre definiált eseménynevet + (auth_state, result) értékpárt. A GA4-be
// ezért sem koordináta, cím, keresőszöveg, útvonal, azonosító, szenzoros vagy
// gyerekadat nem kerülhet. A platform (web/android/ios) a user agentből jön.

export type AnalyticsPlatform = "web" | "android" | "ios";
export type AnalyticsAuthState = "anonymous" | "authenticated";
export type AnalyticsResult = "success" | "error";

export const VEDETT_ROUTE_EVENTS = [
  "vedett_route_open",
  "route_search",
  "route_search_success",
  "route_search_error",
  "navigation_started",
  "navigation_finished",
  // 2026-10-09 — navigációs életciklus. navigation_finished = a felhasználó
  // leállította a navigációt; navigation_completed = az érkezés ELSŐ,
  // megbízható (geometria-alapú ARRIVE + használható GPS) felismerése.
  "route_selected",
  "navigation_completed",
  "navigation_resumed",
  "navigation_rerouted",
  "navigation_error",
  "saved_place_used",
  "login_started",
  "registration_started",
] as const;
export type VedettRouteEventName = (typeof VEDETT_ROUTE_EVENTS)[number];

// A GA4-nek átadható paraméterek EGYETLEN, zárt whitelistje.
export const ALLOWED_EVENT_PARAMS = ["platform", "auth_state", "result", "rank_bucket", "reroute_type", "error_type"] as const;

// Zárt értékkészletek (2026-10-09). Semmilyen szabad szöveg, azonosító,
// koordináta, cím, helynév vagy nyers hibaüzenet nem fér bele.
export const RANK_BUCKETS = ["1", "2", "3", "4", "5+"] as const;
export type AnalyticsRankBucket = (typeof RANK_BUCKETS)[number];
export const REROUTE_TYPES = ["automatic", "live_alternative", "earlier_departure", "rest_stop"] as const;
export type AnalyticsRerouteType = (typeof REROUTE_TYPES)[number];
export const NAVIGATION_ERROR_TYPES = ["reroute_failed", "gps_permission_denied", "gps_unavailable", "speech_failed"] as const;
export type AnalyticsNavigationErrorType = (typeof NAVIGATION_ERROR_TYPES)[number];

/** 0-alapú találati index -> zárt helyezés-kategória. */
export function toRankBucket(index: number): AnalyticsRankBucket {
  if (!Number.isFinite(index) || index < 0) return "5+";
  return index >= 4 ? "5+" : (String(Math.floor(index) + 1) as AnalyticsRankBucket);
}

export function detectAnalyticsPlatform(userAgent: string | null | undefined): AnalyticsPlatform {
  const ua = userAgent ?? "";
  if (!ua.includes("VedettUtvonalNative")) return "web";
  // Explicit marker (capacitor.config.ts: "VedettUtvonalNative/0.1 Android|iOS"),
  // régi buildeknél a WebView saját UA-jából (Android WebView UA-ja "Android"-ot tartalmaz).
  if (/VedettUtvonalNative\/\S+\s+iOS/.test(ua)) return "ios";
  if (/VedettUtvonalNative\/\S+\s+Android/.test(ua) || /Android/.test(ua)) return "android";
  return "ios";
}

export interface BuildEventParamsInput {
  platform: AnalyticsPlatform;
  authState: AnalyticsAuthState;
  result?: AnalyticsResult;
  rankBucket?: AnalyticsRankBucket;
  rerouteType?: AnalyticsRerouteType;
  errorType?: AnalyticsNavigationErrorType;
}

// Pure — csak whitelistelt, enum-értékű mezőket ad vissza.
export function buildEventParams(input: BuildEventParamsInput): Record<string, string> {
  const params: Record<string, string> = {
    platform: input.platform,
    auth_state: input.authState === "authenticated" ? "authenticated" : "anonymous",
  };
  if (input.result === "success" || input.result === "error") params.result = input.result;
  if (input.rankBucket && (RANK_BUCKETS as readonly string[]).includes(input.rankBucket)) params.rank_bucket = input.rankBucket;
  if (input.rerouteType && (REROUTE_TYPES as readonly string[]).includes(input.rerouteType)) params.reroute_type = input.rerouteType;
  if (input.errorType && (NAVIGATION_ERROR_TYPES as readonly string[]).includes(input.errorType)) params.error_type = input.errorType;
  return params;
}

type GtagFn = (command: "event", name: string, params: Record<string, string>) => void;

/**
 * Admin felület (diagnosztika, Journey Monitor szimulátor) — a Védett
 * Útvonal saját eseményei innen NEM mennek ki, hogy ne torzítsák a valódi
 * felhasználói statisztikát.
 */
export function isAnalyticsSuppressedPath(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && /^\/admin(\/|$)/.test(pathname);
}

/**
 * Egyszeri küldés navigációs munkamenetenként (pl. érkezés, hibatípusok):
 * a hívó navigáció indításakor/visszaállításakor új kaput hoz létre.
 */
export interface NavigationEventOnceGate {
  sent: Set<string>;
}
export function createNavigationEventOnceGate(): NavigationEventOnceGate {
  return { sent: new Set<string>() };
}
/** true az ELSŐ alkalommal (ekkor meg is jelöli), utána mindig false. */
export function markNavigationEventOnce(gate: NavigationEventOnceGate, key: string): boolean {
  if (gate.sent.has(key)) return false;
  gate.sent.add(key);
  return true;
}

interface RouteStructureLeg {
  mode: string;
  routeShortName?: string;
  fromName?: string;
  toName?: string;
}
/**
 * Változott-e ténylegesen az útvonal szerkezete (közösségi közlekedési és
 * kölcsönzött-jármű szakaszok sorrendje: mód + járatszám + megállók)? Az
 * indulási idő és a gyalogos szakaszok (pl. "Aktuális helyzet" kezdőpont)
 * nem számítanak — így egy pihenő utáni puszta folytatás nem újratervezés.
 * Csak a döntéshez használt, semmi nem kerül belőle az analitikába.
 */
export function hasRouteStructureChanged(
  previous: { legs: RouteStructureLeg[] } | null | undefined,
  next: { legs: RouteStructureLeg[] } | null | undefined,
): boolean {
  if (!previous || !next) return false;
  const key = (j: { legs: RouteStructureLeg[] }) =>
    j.legs
      .filter((l) => l.mode === "TRANSIT" || l.mode === "RENTAL")
      .map((l) => [l.mode, l.routeShortName ?? "", l.fromName ?? "", l.toName ?? ""].join("|"))
      .join(">>");
  return key(previous) !== key(next);
}

export function trackVedettRouteEvent(
  event: VedettRouteEventName,
  options: {
    authState: AnalyticsAuthState;
    result?: AnalyticsResult;
    rankBucket?: AnalyticsRankBucket;
    rerouteType?: AnalyticsRerouteType;
    errorType?: AnalyticsNavigationErrorType;
  }
): void {
  try {
    if (typeof window === "undefined") return;
    if (!VEDETT_ROUTE_EVENTS.includes(event)) return;
    if (isAnalyticsSuppressedPath(window.location?.pathname)) return;
    // Fail-closed: hozzájárulás (granted) nélkül NO-OP. A kulcs azonos a
    // lib/analytics/consent.ts ANALYTICS_CONSENT_KEY értékével (teszt őrzi).
    if (window.localStorage.getItem("vs-analytics-consent") !== "granted") return;
    const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
    if (typeof gtag !== "function") return;
    const params = buildEventParams({
      platform: detectAnalyticsPlatform(window.navigator.userAgent),
      authState: options.authState,
      result: options.result,
      rankBucket: options.rankBucket,
      rerouteType: options.rerouteType,
      errorType: options.errorType,
    });
    gtag("event", event, params);
  } catch {
    // A mérés SOHA nem törheti el az alkalmazást.
  }
}
