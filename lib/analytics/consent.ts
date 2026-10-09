// VédettSarok – GA4 hozzájárulás-kezelés (Basic Consent Mode jelleg).
// Elv: hozzájárulás (granted) nélkül a gtag.js NEM töltődik be, gtag config
// nem fut, és semmilyen GA kérés nem indul. Nincs Advanced Consent Mode
// (cookieless ping). A tárolt érték KIZÁRÓLAG a választást tartalmazza.

export const ANALYTICS_CONSENT_KEY = "vs-analytics-consent";
export const ANALYTICS_CONSENT_CHANGE_EVENT = "vs-analytics-consent-change";
export const ANALYTICS_CONSENT_OPEN_EVENT = "vs-analytics-consent-open";

export type AnalyticsConsentState = "unset" | "granted" | "denied";

export interface ConsentStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readAnalyticsConsent(storage?: ConsentStorageLike | null): AnalyticsConsentState {
  try {
    const s = storage === undefined ? (globalThis as { localStorage?: ConsentStorageLike }).localStorage : storage;
    const v = s?.getItem(ANALYTICS_CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : "unset";
  } catch {
    return "unset";
  }
}

export function writeAnalyticsConsent(
  value: "granted" | "denied",
  storage?: ConsentStorageLike | null
): void {
  try {
    const s = storage === undefined ? (globalThis as { localStorage?: ConsentStorageLike }).localStorage : storage;
    s?.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    // no-op
  }
}

// ── GA betöltés / leállítás ─────────────────────────────────────────────

export interface ConsentEnv {
  win: any;
  doc: any;
  measurementId: string;
  nonce?: string;
}

const CONSENT_DENIED = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};
const CONSENT_GRANTED = {
  analytics_storage: "granted",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

function isGaCookie(name: string): boolean {
  return /^_ga($|_)/.test(name) || name === "_gid" || /^_gat/.test(name) || /^_gac_/.test(name);
}

// Csak GA sütiket töröl (_ga, _ga_<ID>, _gid, _gat*, _gac_*), a hoszt és a
// szülő-domainek minden változatán. Más sütihez (pl. Supabase auth) nem nyúl.
export function clearGoogleAnalyticsCookies(doc: any, hostname: string): void {
  try {
    const names = String(doc.cookie || "")
      .split(";")
      .map((c: string) => c.split("=")[0].trim())
      .filter(isGaCookie);
    if (names.length === 0) return;
    const parts = String(hostname || "").split(".");
    const domains: (string | null)[] = [null];
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts.slice(i).join(".");
      domains.push(d, "." + d);
    }
    for (const n of names) {
      for (const d of domains) {
        doc.cookie = `${n}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${d ? `; domain=${d}` : ""}`;
      }
    }
  } catch {
    // no-op
  }
}

// OLDALCÍM-ADATVÉDELEM (2026-10-09). A GA4 csak domaint + útvonalat kaphat:
// query string (pl. /vedett-utvonal?name=…&lat=…&lon=…) és fragment SOHA.
// A page_title fix (egy oldal címe tartalmazhat helynevet), a page_referrer
// üres. A mezőket `gtag("set", …)`-tel is rögzítjük, így a GA4 automatikus
// (bővített mérés) eseményei is ezeket viszik a böngésző valódi URL-je
// helyett; kliensoldali navigációkor a hívó (AnalyticsConsent) frissíti.
export const ANALYTICS_PAGE_TITLE = "VédettSarok";

export interface SanitizedPageFields {
  page_location: string;
  page_referrer: "";
  page_title: string;
}

export function buildSanitizedPageFields(location: { origin?: string; pathname?: string } | null | undefined): SanitizedPageFields {
  const origin = typeof location?.origin === "string" ? location.origin : "";
  let pathname = typeof location?.pathname === "string" ? location.pathname : "/";
  // Védelem: ha valaki pathname-ként teljes href-et adna át.
  pathname = pathname.split("?")[0].split("#")[0] || "/";
  return { page_location: origin + pathname, page_referrer: "", page_title: ANALYTICS_PAGE_TITLE };
}

/**
 * Kliensoldali (Next.js) oldalváltás után: a rögzített mezők frissítése +
 * egy sanitizált page_view. Hozzájárulás nélkül / betöltetlen gtag mellett
 * NO-OP (false).
 */
export function sendSanitizedPageView(win: any, storage?: ConsentStorageLike | null): boolean {
  try {
    if (readAnalyticsConsent(storage === undefined ? win?.localStorage : storage) !== "granted") return false;
    if (typeof win?.gtag !== "function") return false;
    const fields = buildSanitizedPageFields(win.location);
    win.gtag("set", fields);
    win.gtag("event", "page_view", fields);
    return true;
  } catch {
    return false;
  }
}

export function applyAnalyticsConsent(state: AnalyticsConsentState, env: ConsentEnv): void {
  const { win, doc, measurementId } = env;
  try {
    const disableKey = `ga-disable-${measurementId}`;
    if (state === "granted") {
      win[disableKey] = false;
      win.dataLayer = win.dataLayer || [];
      win.gtag = function () {
        // eslint-disable-next-line prefer-rest-params
        win.dataLayer.push(arguments);
      };
      if (!win.__vsGaScriptLoaded) {
        win.gtag("consent", "default", CONSENT_GRANTED);
        win.gtag("js", new Date());
      } else {
        win.gtag("consent", "update", CONSENT_GRANTED);
      }
      const pageFields = buildSanitizedPageFields(win.location);
      win.gtag("set", pageFields);
      win.gtag("config", measurementId, { ...pageFields });
      if (!win.__vsGaScriptLoaded) {
        win.__vsGaScriptLoaded = true;
        const s = doc.createElement("script");
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        if (env.nonce) s.nonce = env.nonce;
        doc.head.appendChild(s);
      }
      return;
    }
    // unset / denied: semmi nem töltődik és nem indul. Ha korábban már
    // betöltődött (granted -> denied), az adatküldést azonnal leállítjuk.
    if (win.__vsGaScriptLoaded) {
      win[disableKey] = true;
      try {
        win.gtag?.("consent", "update", CONSENT_DENIED);
      } catch {
        // no-op
      }
      win.gtag = undefined;
      clearGoogleAnalyticsCookies(doc, win.location.hostname);
    } else if (state === "denied") {
      clearGoogleAnalyticsCookies(doc, win.location.hostname);
    }
  } catch {
    // A mérés SOHA nem törheti el az alkalmazást.
  }
}
