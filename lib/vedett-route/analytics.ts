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
  "saved_place_used",
  "login_started",
  "registration_started",
] as const;
export type VedettRouteEventName = (typeof VEDETT_ROUTE_EVENTS)[number];

// A GA4-nek átadható paraméterek EGYETLEN, zárt whitelistje.
export const ALLOWED_EVENT_PARAMS = ["platform", "auth_state", "result"] as const;

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
}

// Pure — csak whitelistelt, enum-értékű mezőket ad vissza.
export function buildEventParams(input: BuildEventParamsInput): Record<string, string> {
  const params: Record<string, string> = {
    platform: input.platform,
    auth_state: input.authState === "authenticated" ? "authenticated" : "anonymous",
  };
  if (input.result === "success" || input.result === "error") params.result = input.result;
  return params;
}

type GtagFn = (command: "event", name: string, params: Record<string, string>) => void;

export function trackVedettRouteEvent(
  event: VedettRouteEventName,
  options: { authState: AnalyticsAuthState; result?: AnalyticsResult }
): void {
  try {
    if (typeof window === "undefined") return;
    if (!VEDETT_ROUTE_EVENTS.includes(event)) return;
    const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
    if (typeof gtag !== "function") return;
    const params = buildEventParams({
      platform: detectAnalyticsPlatform(window.navigator.userAgent),
      authState: options.authState,
      result: options.result,
    });
    gtag("event", event, params);
  } catch {
    // A mérés SOHA nem törheti el az alkalmazást.
  }
}
