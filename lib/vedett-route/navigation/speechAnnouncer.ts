// NAVIGATION — HANGOS (TTS) UTASÍTÁS DEDUPE (2026-09-25).
//
// Pure, determinisztikus, UI-/browser API-FÜGGETLEN modul: NEM hívja a
// Web Speech API-t (az a hívó — lib/hooks/useNavigationSpeech.ts — dolga),
// NEM dönt navigációs kérdésekben (forduló/megállószám/boarding/alighting/
// reroute/journey-váltás) — KIZÁRÓLAG a MÁR MEGLÉVŐ, máshol (lib/vedett-
// route/navigation/instructions.ts selectActiveInstructionWithStopProgress
// és a hívó oldali walk-progress/stop-progress derivációk — lásd
// VedettUtvonalSearchForm.tsx) kiszámolt CANONICAL instrukcióból épít egy
// stabil "meg kell-e szólalni" döntést.
//
// SZÁNDÉKOSAN NEM RÉSZE:
//   - saját forduló-/megállószám-számítás (lásd a modul fejlécének
//     "TTS NEM lehet külön navigációs döntéshozó" alapelve);
//   - a beszélendő szöveg KITALÁLÁSA — a hívó a képernyőn már megjelenő
//     title/detail szöveget adja át (lásd buildAnnouncement()), ez a modul
//     csak összefűzi őket.

import type { NavigationInstruction } from "./instructions.ts";

export interface SpeechAnnouncement {
  // Stabil azonosító — SOHA nem a renderelt szöveg, SOHA nem timestamp.
  // Az alap a canonical NavigationInstruction már meglévő, stabil `id`
  // mezője (pl. "walk-2", "ride-1", "alight-1", "arrive" — lásd
  // instructions.ts buildNavigationInstructions()), amit a hívó egy
  // OPCIONÁLIS, szintén nem-GPS-zajos "subState" darabbal egészíthet ki
  // (pl. egy gyalogos forduló saját, geometriai manőver-azonosítója, vagy
  // a "leszállóhely közelében" állapot — lásd resolveSpeechSubState() a
  // hívó oldalon). A pontos hátralévő méter/megállószám SOSEM kerül a
  // kulcsba — az minden GPS fixnél változhat, ami spam-elné a felolvasást.
  key: string;
  // A ténylegesen felolvasandó szöveg — MINDIG a canonical instruction már
  // megjelenített title/detail mezőiből, sosem új szövegezés.
  text: string;
}

// Pure helper: a képernyőn megjelenő title (+ opcionális detail) -> egy
// mondat, amit a TTS felolvas. Szó szerint UGYANAZ az információ, ami a
// navigációs kártyán látszik (lásd VedettUtvonalSearchForm.tsx
// navigationInstructionForDisplay.title/.detail renderelése) — a vizuális
// és a hangos instrukció szemantikailag megegyezik.
export function buildAnnouncementText(instruction: Pick<NavigationInstruction, "title" | "detail">): string {
  const title = instruction.title.trim();
  const detail = instruction.detail?.trim();
  return detail ? `${title}. ${detail}` : title;
}

// Pure helper: instrukció + opcionális, a hívó által már kiszámolt,
// nem-GPS-zajos "subState" darab -> teljes SpeechAnnouncement, vagy null,
// ha nincs aktuális instrukció (a kártya el van rejtve / nincs navigáció).
export function buildAnnouncement(
  instruction: Pick<NavigationInstruction, "id" | "title" | "detail"> | null | undefined,
  subState?: string | null
): SpeechAnnouncement | null {
  if (!instruction) return null;
  const key = subState ? `${instruction.id}|${subState}` : instruction.id;
  return { key, text: buildAnnouncementText(instruction) };
}

// ============================================================================
// DEDUPE STATE MACHINE — lásd a hívó (useNavigationSpeech) fejlécét a teljes
// élettartam-kezelésről (mount/reroute/GPS loss/background-foreground).
// ============================================================================

export interface SpeechAnnouncerState {
  // Az utoljára ténylegesen kimondott (vagy priming során csendben
  // rögzített) SpeechAnnouncement.key. Null, ha még semmi nem lett
  // rögzítve, VAGY explicit invalidateSpeechAnnouncerState() után (lásd
  // ott), amíg az első (poszt-invalidate) announcement meg nem érkezik.
  lastKey: string | null;
  // Igaz, amint a state LÁTOTT már legalább egy announcement-et — ez teszi
  // lehetővé a "néma priming" viselkedést (lásd resolveSpeechDecision()
  // lentebb): az ELSŐ valaha látott instrukció SOSEM szólal meg magától
  // (ez védi ki a session-restore-t és a foreground-visszatérést — a
  // hívó/komponens (re)mountolása/effekt-újrafutása önmagában SOSEM okoz
  // "régi instrukció" felolvasást), de utána MINDEN valódi változás igen.
  primed: boolean;
}

export const INITIAL_SPEECH_ANNOUNCER_STATE: SpeechAnnouncerState = { lastKey: null, primed: false };

// Explicit "új navigációs kontextus" reset (pl. elfogadott reroute — lásd
// a hívó oldali rerouteSessionRef generation-jét). A priming-gel ELLENTÉTBEN
// itt `primed: true` marad — a KÖVETKEZŐ announcement (jellemzően az ÚJ,
// elfogadott journey aktuális instrukciója) egy VALÓDI változásnak számít
// `lastKey: null`-hoz képest, tehát megszólalhat (lásd a modul fejlécének
// "csak az új journey aktuális instrukciója beszélhet" pontja) — szemben az
// induló, néma priminggel (INITIAL_SPEECH_ANNOUNCER_STATE), ami SOSEM
// szólaltatja meg az első látott instrukciót.
export function invalidateSpeechAnnouncerState(): SpeechAnnouncerState {
  return { lastKey: null, primed: true };
}

export interface SpeechDecision {
  state: SpeechAnnouncerState;
  shouldSpeak: boolean;
}

// Pure fő függvény: state + aktuális announcement -> (új state, kell-e
// beszélni). Determinisztikus, nincs benne Date.now()/browser API.
//
// SZABÁLYOK (lásd a mezők kommentjeit fent a részletes indoklásért):
//   1. Nincs announcement (kártya rejtve) -> nincs beszéd, a state
//      VÁLTOZATLAN marad (egy ideiglenesen eltűnő, majd UGYANAZZAL a
//      kulccsal visszatérő instrukció nem szólal meg újra pusztán ettől).
//   2. Még nem priming-elt state -> az ELSŐ announcement csendben
//      rögzítődik, NEM szólal meg (mount/restore/foreground-visszatérés
//      védelem).
//   3. Ugyanaz a kulcs, mint utoljára -> nincs beszéd (a fő anti-spam
//      szabály: azonos logikai instrukció rendereléskor/GPS fixenként
//      SOSEM ismétlődik).
//   4. Új kulcs -> beszéd, ÉS az új kulcs lesz a "utoljára kimondott".
export function resolveSpeechDecision(
  state: SpeechAnnouncerState,
  announcement: SpeechAnnouncement | null
): SpeechDecision {
  if (!announcement) {
    return { state, shouldSpeak: false };
  }
  if (!state.primed) {
    return { state: { lastKey: announcement.key, primed: true }, shouldSpeak: false };
  }
  if (state.lastKey === announcement.key) {
    return { state, shouldSpeak: false };
  }
  return { state: { lastKey: announcement.key, primed: true }, shouldSpeak: true };
}
