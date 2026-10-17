// VÉDETT ÚTVONAL — NATÍV GOOGLE BELÉPÉS (Capacitor Android, 2026-10-03).
//
// Architektúra (audit szerint): Supabase signInWithOAuth (PKCE,
// skipBrowserRedirect) -> Capacitor Browser (Chrome Custom Tab) -> Google ->
// Supabase -> hu.vedettsarok.utvonal://auth/callback?code=... deep link ->
// App appUrlOpen -> a WebView a MEGLÉVŐ /auth/callback?code=...&next=... -ra
// navigál, ahol az exchangeCodeForSession a WebView-ban (ahol a PKCE
// code_verifier süti van) létrehozza a Supabase session-t. Ugyanaz a
// VédettSarok fiók (auth.users + profiles + RLS); nincs második auth rendszer.
//
// MIÉRT NEM @capacitor/core / @capacitor/browser import: az alkalmazás egy
// REMOTE server.url oldalt tölt be. A Capacitor 8 native-bridge.js ilyenkor
// csak a window.Capacitor natív hidat (nativePromise / nativeCallback /
// addListener / isNativePlatform) injektálja; a `Capacitor.Plugins.Browser`
// proxyt a @capacitor/core registerPlugin() hozná létre, ami nincs a root
// Next.js csomagban (és NEM is kerülhet oda). Ezért a natív pluginokat
// (Browser, App) az injektált hídon át, névvel hívjuk.
//
// BIZTONSÁG: csak a pontos deep link (séma + host + útvonal) fogadható el; a
// query-ből KIZÁRÓLAG code / error / error_description olvasódik; access- vagy
// refresh-token SOSEM kerül URL-be; a nyers hibaszöveg nem jelenik meg a
// felhasználónak; beágyazott WebView-s Google OAuth nincs (nincs fallback).

import type { SupabaseClient } from "@supabase/supabase-js";

export const NATIVE_OAUTH_SCHEME = "hu.vedettsarok.utvonal";
export const NATIVE_OAUTH_HOST = "auth";
export const NATIVE_OAUTH_PATH = "/callback";
export const NATIVE_OAUTH_REDIRECT_URI = "hu.vedettsarok.utvonal://auth/callback";
export const NATIVE_OAUTH_NEXT = "/vedett-utvonal";

export const NATIVE_GOOGLE_ERRORS = {
  unavailable: "A Google-belépés ebben az alkalmazásban jelenleg nem érhető el. Lépj be e-mailben.",
  failed: "A Google-belépés nem sikerült. Próbáld újra, vagy lépj be e-mailben.",
  cancelled: "A Google-belépés megszakadt.",
  timeout: "A belépés nem fejeződött be. Próbáld újra.",
} as const;

type BridgeListener = { remove: () => Promise<void> | void };

export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  /** A natív oldal által injektált plugin-leírók (név + metódusok). */
  PluginHeaders?: unknown[];
  nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>;
  addListener?: (plugin: string, event: string, callback: (data: { url?: string } | undefined) => void) => BridgeListener;
}

export interface NativeOAuthWindow {
  Capacitor?: CapacitorBridge;
  location: { assign: (url: string) => void };
}

function currentWindow(): NativeOAuthWindow | null {
  return typeof window === "undefined" ? null : (window as unknown as NativeOAuthWindow);
}

/** A natív Capacitor shell injektált hídja, vagy null (normál böngésző). */
export function getCapacitorBridge(win: NativeOAuthWindow | null = currentWindow()): CapacitorBridge | null {
  const cap = win?.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function") return null;
  try {
    return cap.isNativePlatform() === true ? cap : null;
  } catch {
    return null;
  }
}

export function isNativeCapacitor(win: NativeOAuthWindow | null = currentWindow()): boolean {
  return getCapacitorBridge(win) !== null;
}

export type NativeOAuthCallback =
  | { kind: "code"; code: string }
  | { kind: "error"; error: string; description: string | null };

// A Supabase PKCE auth code (UUID jellegű); szigorú karakterkészlet, hogy ne
// kerülhessen értelmezhetetlen/injektált érték a callback URL-be.
const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;

/**
 * A deep link elemzése. Csak a PONTOS hu.vedettsarok.utvonal://auth/callback
 * fogadható el; minden más (más séma/host/útvonal, user-info, hibás URL) null.
 * A query-ből kizárólag code / error / error_description olvasódik.
 */
export function parseNativeOAuthCallback(rawUrl: unknown): NativeOAuthCallback | null {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${NATIVE_OAUTH_SCHEME}:`) return null;
  if (url.host !== NATIVE_OAUTH_HOST) return null;
  if (url.pathname !== NATIVE_OAUTH_PATH) return null;
  if (url.username || url.password) return null;

  const error = url.searchParams.get("error");
  if (error) {
    return { kind: "error", error: error.slice(0, 100), description: url.searchParams.get("error_description") };
  }
  const code = url.searchParams.get("code");
  if (code && CODE_PATTERN.test(code)) return { kind: "code", code };
  return null;
}

/**
 * A WebView-ban megnyitandó, SAME-ORIGIN callback útvonal. A code URL-kódolt;
 * a next a safeReturnPath-szel egyező elven csak "/"-lel kezdődő relatív út.
 */
export function buildWebViewCallbackPath(code: string, next: string = NATIVE_OAUTH_NEXT): string {
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("://") ? next : NATIVE_OAUTH_NEXT;
  return `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}`;
}

export interface NativeGoogleLoginOptions {
  next?: string;
  win?: NativeOAuthWindow | null;
  /** Rövid, magyar, felhasználónak szánt hibaüzenet. */
  onError: (message: string) => void;
  /** Közvetlenül a WebView /auth/callback navigációja előtt (loading állapothoz). */
  onReturning?: () => void;
  /** A user megszakította (pl. bezárta a Custom Tabot). */
  onCancel?: () => void;
  /** A browserFinished után ennyit várunk a deep linkre (ms). */
  cancelGraceMs?: number;
}

// ---------------------------------------------------------------------------
// iOS NATÍV HITELESÍTÉSI MUNKAMENET (2026-10-17, 13-as build). A régi
// iOS-utat (Capacitor Browser = SFSafariViewController + egyedi URL-séma)
// az iOS nem mindig adja vissza az appnak; az Apple OAuth-ra szánt
// ASWebAuthenticationSession-je a callback URL-t KÖZVETLENÜL a natív
// metódusnak adja (nincs appUrlOpen, nincs visszajátszható esemény).
// Képességvizsgálat: a natív VedettNavigation plugin `authenticate`
// metódusa a Capacitor által injektált PluginHeaders-ben szerepel-e. Ezt
// NEM hívással próbáljuk ki: a metódust nem ismerő régi iOS-build a hívásra
// sosem válaszolna. Androidon és régebbi iOS-buildeken a meglévő Browser út
// marad.
export const NATIVE_AUTH_SESSION_PLUGIN = "VedettNavigation";
export const NATIVE_AUTH_SESSION_METHOD = "authenticate";

/** A "Belépés folyamatban…" takaró legfeljebb ennyi ideig látszik (ms). */
export const NATIVE_LOGIN_RETURN_TIMEOUT_MS = 20_000;

type PluginHeader = { name?: unknown; methods?: Array<{ name?: unknown }> };

export function supportsNativeAuthSession(win: NativeOAuthWindow | null = currentWindow()): boolean {
  const bridge = getCapacitorBridge(win);
  if (!bridge) return false;
  try {
    if (typeof bridge.getPlatform !== "function" || bridge.getPlatform() !== "ios") return false;
  } catch {
    return false;
  }
  const headers = bridge.PluginHeaders;
  if (!Array.isArray(headers)) return false;
  return (headers as PluginHeader[]).some(
    (h) =>
      h?.name === NATIVE_AUTH_SESSION_PLUGIN &&
      Array.isArray(h.methods) &&
      h.methods.some((m) => m?.name === NATIVE_AUTH_SESSION_METHOD),
  );
}

function isCancelledNativeAuth(err: unknown): boolean {
  const e = err as { message?: unknown; code?: unknown } | null;
  return e?.message === "AUTH_CANCELLED" || e?.code === "AUTH_CANCELLED";
}

let activeCleanup: (() => void) | null = null;

/**
 * Natív Google belépés indítása. SOHA nem navigál a WebView-val a Google-re;
 * ha a híd/plugin nem elérhető, hibát jelez (nincs beágyazott WebView fallback).
 *
 * Egyszerre egy kísérlet él: egy új indítás az előzőt lezárja, és a lezárt
 * kísérlet semmilyen későn érkező eredménye nem navigál, nem nyit böngészőt
 * és nem jelez hibát. A PKCE code_verifier-t a signInWithOAuth a WebView-ban
 * (sütiben) tárolja; mivel a kísérlet a kódot csak a SAJÁT signInWithOAuth
 * hívása után fogadja el, a /auth/callback kódcseréje ugyanahhoz a
 * verifierhez tartozik.
 */
export async function startNativeGoogleLogin(
  supabase: Pick<SupabaseClient, "auth">,
  options: NativeGoogleLoginOptions
): Promise<void> {
  const win = options.win === undefined ? currentWindow() : options.win;
  const bridge = getCapacitorBridge(win);
  const next = options.next ?? NATIVE_OAUTH_NEXT;

  if (!win || !bridge || typeof bridge.nativePromise !== "function") {
    options.onError(NATIVE_GOOGLE_ERRORS.unavailable);
    return;
  }
  const useAuthSession = supportsNativeAuthSession(win);
  if (!useAuthSession && typeof bridge.addListener !== "function") {
    options.onError(NATIVE_GOOGLE_ERRORS.unavailable);
    return;
  }

  const nativePromise = bridge.nativePromise.bind(bridge);

  activeCleanup?.();
  activeCleanup = null;

  const listeners: BridgeListener[] = [];
  let settled = false;
  let acceptCallbacks = false;
  let cancelTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    settled = true;
    if (cancelTimer) clearTimeout(cancelTimer);
    for (const l of listeners.splice(0)) {
      try {
        void l.remove();
      } catch {
        /* ignore */
      }
    }
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;

  const closeBrowser = () => {
    void nativePromise("Browser", "close", {}).catch(() => undefined);
  };

  const handleCallback = (parsed: NativeOAuthCallback | null) => {
    if (!parsed) {
      options.onError(NATIVE_GOOGLE_ERRORS.failed);
    } else if (parsed.kind === "code") {
      options.onReturning?.();
      win.location.assign(buildWebViewCallbackPath(parsed.code, next));
    } else if (parsed.error === "access_denied") {
      options.onError(NATIVE_GOOGLE_ERRORS.cancelled);
    } else {
      options.onError(NATIVE_GOOGLE_ERRORS.failed);
    }
  };

  if (!useAuthSession) {
    const addListener = (bridge.addListener as NonNullable<CapacitorBridge["addListener"]>).bind(bridge);
    try {
      listeners.push(
        addListener("App", "appUrlOpen", (event) => {
          // Visszajátszott (korábbi kísérletből megőrzött) vagy lezárt
          // kísérlethez érkező callback: figyelmen kívül.
          if (settled || !acceptCallbacks) return;
          const parsed = parseNativeOAuthCallback(event?.url);
          if (!parsed) return; // idegen URL: figyelmen kívül hagyjuk
          cleanup();
          closeBrowser();
          handleCallback(parsed);
        })
      );
      listeners.push(
        addListener("Browser", "browserFinished", () => {
          if (settled || cancelTimer) return;
          cancelTimer = setTimeout(() => {
            if (settled) return;
            cleanup();
            (options.onCancel ?? (() => options.onError(NATIVE_GOOGLE_ERRORS.cancelled)))();
          }, options.cancelGraceMs ?? 1500);
        })
      );
    } catch {
      cleanup();
      options.onError(NATIVE_GOOGLE_ERRORS.unavailable);
      return;
    }

    // A Capacitor App plugin a figyelő nélkül érkezett appUrlOpen eseményt
    // megőrzi, és a feliratkozáskor azonnal kiküldi. Egy natív oda-vissza
    // hívás után (ugyanazon a plugin-soron, sorrendben) a visszajátszás már
    // lezajlott; csak az ezután érkező callback tartozhat ehhez a kísérlethez.
    try {
      await nativePromise("App", "getState", {});
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (settled) return;
    acceptCallbacks = true;
  }

  let authUrl: string | null | undefined;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_OAUTH_REDIRECT_URI, skipBrowserRedirect: true },
    });
    authUrl = error ? null : data?.url;
  } catch {
    authUrl = null;
  }
  // Közben új kísérlet indult: ez már nem nyithat böngészőt.
  if (settled) return;

  let parsedAuthUrl: URL | null = null;
  try {
    parsedAuthUrl = authUrl ? new URL(authUrl) : null;
  } catch {
    parsedAuthUrl = null;
  }
  if (!parsedAuthUrl || parsedAuthUrl.protocol !== "https:") {
    cleanup();
    options.onError(NATIVE_GOOGLE_ERRORS.failed);
    return;
  }

  if (useAuthSession) {
    let result: unknown;
    try {
      result = await nativePromise(NATIVE_AUTH_SESSION_PLUGIN, NATIVE_AUTH_SESSION_METHOD, {
        url: parsedAuthUrl.toString(),
        callbackScheme: NATIVE_OAUTH_SCHEME,
      });
    } catch (err) {
      if (settled) return;
      cleanup();
      if (isCancelledNativeAuth(err)) {
        (options.onCancel ?? (() => options.onError(NATIVE_GOOGLE_ERRORS.cancelled)))();
      } else {
        options.onError(NATIVE_GOOGLE_ERRORS.failed);
      }
      return;
    }
    if (settled) return;
    cleanup();
    handleCallback(parseNativeOAuthCallback((result as { url?: unknown } | null)?.url));
    return;
  }

  try {
    await nativePromise("Browser", "open", { url: parsedAuthUrl.toString() });
  } catch {
    if (settled) return;
    cleanup();
    options.onError(NATIVE_GOOGLE_ERRORS.unavailable);
  }
}
