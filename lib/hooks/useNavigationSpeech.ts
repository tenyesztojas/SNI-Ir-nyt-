"use client";

// NAVIGATION — HANGOS (TTS) NAVIGÁCIÓ, Web Speech API bekötés (2026-09-25).
//
// Vékony, browser-API-t hívó réteg a pure lib/vedett-route/navigation/
// speechAnnouncer.ts felett — a DÖNTÉS ("kell-e most beszélni") onnan jön,
// ez a hook KIZÁRÓLAG a window.speechSynthesis-t vezérli (cancel/speak) a
// döntés alapján, plusz a felhasználói BE/KI preferenciát perzisztálja
// (böngésző-refresh után is megmarad — lásd a navigationSessionPersistence.ts
// meglévő localStorage try/catch mintáját, amit itt is követünk).
//
// SSR-safe: minden window/speechSynthesis hozzáférés feature-detectált,
// nem támogatott böngészőben csendben no-op — a navigáció (vizuális
// instrukciók) ettől FÜGGETLENÜL teljesen működik tovább.

import { useEffect, useRef, useState } from "react";
import {
  INITIAL_SPEECH_ANNOUNCER_STATE,
  invalidateSpeechAnnouncerState,
  resolveSpeechDecision,
  type SpeechAnnouncement,
  type SpeechAnnouncerState,
} from "@/lib/vedett-route/navigation/speechAnnouncer";

const SPEECH_PREFERENCE_STORAGE_KEY = "vedett-route:navigation-speech-enabled:v1";

type SpeechSynthesisLike = {
  cancel: () => void;
  speak: (utterance: SpeechSynthesisUtterance) => void;
};

function getSpeechSynthesis(): SpeechSynthesisLike | null {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return null;
  return window.speechSynthesis;
}

/** Igaz, ha a böngésző támogatja a Web Speech API-t (feature detection). */
export function isNavigationSpeechSupported(): boolean {
  return getSpeechSynthesis() !== null;
}

/** Fail-closed: bármilyen storage-hiba (quota/disabled/private mode) esetén default OFF. */
export function loadNavigationSpeechPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SPEECH_PREFERENCE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Best-effort write — storage-hiba esetén a kapcsoló ettől függetlenül működik a session alatt. */
export function saveNavigationSpeechPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPEECH_PREFERENCE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // no-op
  }
}

/**
 * A hívó (VedettUtvonalSearchForm.tsx) BE/KI kapcsoló state-jét kezeli,
 * böngésző-refresh után is megőrizve a választást. Default: OFF (lásd
 * loadNavigationSpeechPreference() fail-closed viselkedése is).
 */
export function useNavigationSpeechPreference(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(loadNavigationSpeechPreference());
  }, []);
  const setPreference = (next: boolean) => {
    setEnabled(next);
    saveNavigationSpeechPreference(next);
  };
  return [enabled, setPreference];
}

export interface UseNavigationSpeechOptions {
  // A hívó már kiszámolt TELJES kapcsolója: a felhasználói TTS-preferencia
  // ÉS a navigáció ténylegesen aktív állapota (pl. `speechPreference &&
  // navigationMode`) — lásd a modul fejlécének "navigation stop -> cancel()"
  // pontja: amikor ez false-ra vált (kikapcsolás VAGY navigáció leállítása),
  // a hook cancel()-t hív ÉS néma priming-re áll vissza, hogy egy KÉSŐBBI
  // bekapcsolás/újraindítás SOSE mondja ki azonnal a régi instrukciót.
  enabled: boolean;
  // A MÁR kiszámolt canonical announcement (lásd speechAnnouncer.ts
  // buildAnnouncement()) — null, ha nincs megjelenítendő instrukció.
  announcement: SpeechAnnouncement | null;
  // Bármilyen primitív érték, ami KIZÁRÓLAG akkor változik, amikor egy
  // GENUINE új navigációs kontextus kezdődik (pl. elfogadott reroute —
  // a hívó a MEGLÉVŐ rerouteSessionRef generation-számát adja át). Egy
  // változás azonnal cancel()-t hív ÉS eldobja a régi identitást (lásd
  // invalidateSpeechAnnouncerState()), hogy a régi/stale beszéd SOSE
  // fusson tovább az új journey-be, DE (a fenti `enabled`-lel ellentétben)
  // az invalidálás UTÁNI első announcement MÁR beszélhet.
  resetKey?: string | number;
}

export interface UseNavigationSpeechResult {
  supported: boolean;
}

export function useNavigationSpeech({ enabled, announcement, resetKey }: UseNavigationSpeechOptions): UseNavigationSpeechResult {
  const stateRef = useRef<SpeechAnnouncerState>(INITIAL_SPEECH_ANNOUNCER_STATE);
  const lastResetKeyRef = useRef<string | number | undefined>(resetKey);
  const supported = isNavigationSpeechSupported();

  // REROUTE / ÚJ JOURNEY (spec "N" pont) — a régi, esetleg még beszélő
  // instrukciót azonnal megszakítjuk, és a dedupe-identitást eldobjuk, hogy
  // az ÚJ journey aktuális instrukciója (akkor is, ha véletlenül ugyanaz az
  // id-je, mint a régi útvonalé) valóban megszólalhasson.
  useEffect(() => {
    if (resetKey === undefined || lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    stateRef.current = invalidateSpeechAnnouncerState();
    const synth = getSpeechSynthesis();
    synth?.cancel();
  }, [resetKey]);

  // TTS KI / NAVIGÁCIÓ LEÁLLÍTÁSA (spec "navigation stop" / "J" pont) —
  // mindkettő ugyanaz a jel a hívó felől (`enabled` false-ra vált): azonnali
  // cancel(), ÉS visszaállunk a NÉMA priming alapállapotra, hogy egy későbbi
  // bekapcsolás/újraindítás ne mondja ki azonnal a régi instrukciót (lásd
  // speechAnnouncer.ts INITIAL_SPEECH_ANNOUNCER_STATE kommentje).
  useEffect(() => {
    if (enabled) return;
    stateRef.current = INITIAL_SPEECH_ANNOUNCER_STATE;
    const synth = getSpeechSynthesis();
    synth?.cancel();
  }, [enabled]);

  // A TÉNYLEGES döntés + beszéd — a pure resolveSpeechDecision() dönt, ez a
  // blokk csak végrehajtja: legfeljebb EGY aktív utterance-t enged (mindig
  // cancel() az új speak() előtt, lásd a modul fejlécének "SPEECH QUEUE"
  // pontja — nincs felhalmozódó várólista).
  useEffect(() => {
    if (!enabled) return;
    const decision = resolveSpeechDecision(stateRef.current, announcement);
    stateRef.current = decision.state;
    if (!decision.shouldSpeak || !announcement) return;

    const synth = getSpeechSynthesis();
    if (!synth) return;
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(announcement.text);
    // Rögzített magyar nyelv — SOSE hardcode-olt voice név (a böngésző saját
    // alapértelmezett hu-HU hangját választja, ha van neki).
    utterance.lang = "hu-HU";
    synth.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, announcement?.key, announcement?.text]);

  // Unmount / navigáció-kártya eltűnése — sosem maradhat beszélő utterance.
  useEffect(() => {
    return () => {
      getSpeechSynthesis()?.cancel();
    };
  }, []);

  return { supported };
}
