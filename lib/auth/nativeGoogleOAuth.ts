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
} as const;

type BridgeListener = { remove: () => Promise<void> | void };

export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
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

let activeCleanup: (() => void) | null = null;

/**
 * Natív Google belépés indítása. SOHA nem navigál a WebView-val a Google-re;
 * ha a híd/plugin nem elérhető, hibát jelez (nincs beágyazott WebView fallback).
 */
export async function startNativeGoogleLogin(
  supabase: Pick<SupabaseClient, "auth">,
  options: NativeGoogleLoginOptions
): Promise<void> {
  const win = options.win === undefined ? currentWindow() : options.win;
  const bridge = getCapacitorBridge(win);
  const next = options.next ?? NATIVE_OAUTH_NEXT;

  if (!win || !bridge || typeof bridge.nativePromise !== "function" || typeof bridge.addListener !== "function") {
    options.onError(NATIVE_GOOGLE_ERRORS.unavailable);
    return;
  }
  const nativePromise = bridge.nativePromise.bind(bridge);
  const addListener = bridge.addListener.bind(bridge);

  activeCleanup?.();
  activeCleanup = null;

  const listeners: BridgeListener[] = [];
  let settled = false;
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

  try {
    listeners.push(
      addListener("App", "appUrlOpen", (event) => {
        if (settled) return;
        const parsed = parseNativeOAuthCallback(event?.url);
        if (!parsed) return; // idegen URL: figyelmen kívül hagyjuk
        cleanup();
        closeBrowser();
        if (parsed.kind === "code") {
          options.onReturning?.();
          win.location.assign(buildWebViewCallbackPath(parsed.code, next));
        } else if (parsed.error === "access_denied") {
          options.onError(NATIVE_GOOGLE_ERRORS.cancelled);
        } else {
          options.onError(NATIVE_GOOGLE_ERRORS.failed);
        }
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

  try {
    await nativePromise("Browser", "open", { url: parsedAuthUrl.toString() });
  } catch {
    cleanup();
    options.onError(NATIVE_GOOGLE_ERRORS.unavailable);
  }
}
