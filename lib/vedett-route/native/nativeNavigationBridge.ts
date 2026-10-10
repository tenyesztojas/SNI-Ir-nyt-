// HÁTTÉRNAVIGÁCIÓS MVP (2026-10-10) — vékony híd a natív "VedettNavigation"
// Capacitor pluginhoz (vedett-utvonal-native/android/.../navigation/). A
// remote server.url oldalon a pluginok a beinjektált window.Capacitor
// nativePromise()-szal érhetők el (ugyanaz a minta, mint lib/auth/
// nativeGoogleOAuth.ts). FAIL-OPEN: böngészőben, iOS-en vagy plugin nélküli
// régi app-verzióban minden hívás csendben false/null — a webes navigáció
// változatlanul működik.

import type { NativeAlertPlan } from "../navigation/nativeAlertPlan.ts";
import { navDebugLog } from "../navigation/navDebugLog.ts";

export const NATIVE_NAVIGATION_PLUGIN = "VedettNavigation";

interface Bridge {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>;
  addListener?: (plugin: string, event: string, callback: (data: unknown) => void) => { remove?: () => unknown } | undefined;
}

export function getNativeNavigationBridge(win: unknown = typeof window === "undefined" ? null : window): Bridge | null {
  const cap = (win as { Capacitor?: Bridge } | null)?.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || typeof cap.nativePromise !== "function") return null;
  try {
    return cap.isNativePlatform() === true ? cap : null;
  } catch {
    return null;
  }
}

type CallOutcome = { ok: true; value: unknown } | { ok: false; reason: "NO_BRIDGE" | "UNIMPLEMENTED" | "REJECTED"; code?: string };

function isUnimplemented(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const text = `${typeof e?.code === "string" ? e.code : ""} ${typeof e?.message === "string" ? e.message : ""}`;
  return /UNIMPLEMENTED|not implemented/i.test(text);
}

async function callDetailed(method: string, options?: Record<string, unknown>, win?: unknown): Promise<CallOutcome> {
  const bridge = getNativeNavigationBridge(win);
  if (!bridge?.nativePromise) return { ok: false, reason: "NO_BRIDGE" };
  try {
    const result = await bridge.nativePromise(NATIVE_NAVIGATION_PLUGIN, method, options);
    return { ok: true, value: result ?? {} };
  } catch (err) {
    if (isUnimplemented(err)) return { ok: false, reason: "UNIMPLEMENTED" };
    const message = (err as { message?: unknown } | null)?.message;
    // Csak a plugin saját, zárt hibakódjai (pl. LOCATION_PERMISSION_MISSING) kerülnek tovább.
    const code = typeof message === "string" && /^[A-Z_]{3,40}$/.test(message) ? message : undefined;
    return { ok: false, reason: "REJECTED", code };
  }
}

async function call(method: string, options?: Record<string, unknown>, win?: unknown): Promise<unknown | null> {
  const outcome = await callDetailed(method, options, win);
  return outcome.ok ? outcome.value : null; // nincs plugin / nincs engedély / indítás nem engedélyezett
}

export async function startNativeNavigation(plan: NativeAlertPlan, win?: unknown): Promise<boolean> {
  return (await call("start", { plan }, win)) !== null;
}

export async function updateNativeNavigationPlan(plan: NativeAlertPlan, win?: unknown): Promise<boolean> {
  return (await call("updatePlan", { plan }, win)) !== null;
}

export async function stopNativeNavigation(win?: unknown): Promise<boolean> {
  return (await call("stop", undefined, win)) !== null;
}

export interface NativeNavigationState {
  active: boolean;
  stoppedByUser: boolean;
}

export async function getNativeNavigationState(win?: unknown): Promise<NativeNavigationState | null> {
  const r = (await call("getState", undefined, win)) as Partial<NativeNavigationState> | null;
  if (!r) return null;
  return { active: r.active === true, stoppedByUser: r.stoppedByUser === true };
}

// ---------------------------------------------------------------------------
// ELLENŐRZÖTT INDÍTÁS (2026-10-10). A pluginhívás sikere még nem jelenti, hogy
// a foreground service ténylegesen fut (az Android aszinkron indítja, és
// meg is tagadhatja). Ezért indítás után rövid várakozással a getState()
// "active" mezőjét ellenőrizzük. Sikertelenség esetén kontrollált,
// korlátozott számú újrapróba; plugin hiányában (régi app) azonnal feladjuk.

export type NativeStartResult = "started" | "unavailable" | "failed" | "cancelled";

export interface EnsureNativeStartOptions {
  win?: unknown;
  maxAttempts?: number;
  verifyDelayMs?: number;
  retryDelaysMs?: number[];
  shouldContinue?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function ensureNativeNavigationStarted(
  plan: NativeAlertPlan,
  options: EnsureNativeStartOptions = {},
): Promise<NativeStartResult> {
  const {
    win,
    maxAttempts = 3,
    verifyDelayMs = 1_500,
    retryDelaysMs = [3_000, 10_000],
    shouldContinue = () => true,
    sleep = defaultSleep,
  } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!shouldContinue()) return "cancelled";
    const started = await callDetailed("start", { plan }, win);
    navDebugLog("native_start_call", { attempt, ok: started.ok, reason: started.ok ? null : started.reason, code: started.ok ? null : started.code ?? null });
    if (!started.ok && (started.reason === "NO_BRIDGE" || started.reason === "UNIMPLEMENTED")) return "unavailable";
    if (started.ok) {
      await sleep(verifyDelayMs);
      if (!shouldContinue()) return "cancelled";
      const state = await callDetailed("getState", undefined, win);
      const active = state.ok && (state.value as { active?: unknown }).active === true;
      navDebugLog("native_state_check", { attempt, active });
      if (active) return "started";
    }
    if (attempt < maxAttempts) await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 5_000);
  }
  navDebugLog("native_start_gave_up", { attempts: maxAttempts });
  return "failed";
}

// ---------------------------------------------------------------------------
// NATÍV MAGYAR TTS (2026-10-10). Az Android WebView-ban a Web Speech API
// (speechSynthesis) jellemzően nem érhető el, ezért a natív app a plugin
// Android TextToSpeech-ét használja. Fail-open: böngészőben/iOS-en/régi
// appban "not_native"/"unavailable" — a webes viselkedés változatlan.

export type NativeTtsReason =
  | "NOT_NATIVE"
  | "PLUGIN_UNAVAILABLE"
  | "ENGINE_INIT_FAILED"
  | "LANGUAGE_MISSING_DATA"
  | "LANGUAGE_NOT_SUPPORTED"
  | "INIT_TIMEOUT"
  | "UNKNOWN";

export interface NativeTtsStatus {
  available: boolean;
  reason: NativeTtsReason | null;
}

const KNOWN_TTS_REASONS: readonly string[] = [
  "ENGINE_INIT_FAILED",
  "LANGUAGE_MISSING_DATA",
  "LANGUAGE_NOT_SUPPORTED",
  "INIT_TIMEOUT",
];

export async function getNativeTtsStatus(win?: unknown): Promise<NativeTtsStatus> {
  const outcome = await callDetailed("ttsStatus", undefined, win);
  if (!outcome.ok) {
    return { available: false, reason: outcome.reason === "NO_BRIDGE" ? "NOT_NATIVE" : "PLUGIN_UNAVAILABLE" };
  }
  const v = outcome.value as { available?: unknown; reason?: unknown };
  if (v.available === true) return { available: true, reason: null };
  const reason = typeof v.reason === "string" && KNOWN_TTS_REASONS.includes(v.reason) ? (v.reason as NativeTtsReason) : "UNKNOWN";
  navDebugLog("native_tts_unavailable", { reason });
  return { available: false, reason };
}

/** true = a natív motor elfogadta a felolvasást (QUEUE_FLUSH: megszakítja az előzőt). */
export async function nativeSpeak(text: string, id: string, win?: unknown): Promise<boolean> {
  const outcome = await callDetailed("speak", { text, id }, win);
  if (!outcome.ok) navDebugLog("native_tts_speak_failed", { reason: outcome.reason, code: outcome.code ?? null });
  return outcome.ok;
}

export async function nativeStopSpeaking(win?: unknown): Promise<boolean> {
  return (await call("stopSpeaking", undefined, win)) !== null;
}

export async function setNativeSpeechEnabled(enabled: boolean, win?: unknown): Promise<boolean> {
  return (await call("setSpeechEnabled", { enabled }, win)) !== null;
}

/** Natív TTS-hibák (zárt kód) figyelése; visszaad egy leiratkozó függvényt. */
export function onNativeTtsError(callback: (code: string) => void, win?: unknown): () => void {
  const bridge = getNativeNavigationBridge(win);
  if (!bridge || typeof bridge.addListener !== "function") return () => {};
  try {
    const handle = bridge.addListener(NATIVE_NAVIGATION_PLUGIN, "ttsError", (data) => {
      const code = (data as { code?: unknown } | null)?.code;
      callback(typeof code === "string" && /^[A-Z_0-9-]{3,40}$/.test(code) ? code : "SPEAK_FAILED");
    });
    return () => {
      try {
        void handle?.remove?.();
      } catch {
        // no-op
      }
    };
  } catch {
    return () => {};
  }
}
