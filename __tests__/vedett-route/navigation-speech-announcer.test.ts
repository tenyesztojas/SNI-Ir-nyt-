// NAVIGATION — HANGOS (TTS) UTASÍTÁS DEDUPE teszt (2026-09-25).
//
// A pure lib/vedett-route/navigation/speechAnnouncer.ts modult teszteli —
// SOSEM a böngésző Web Speech API-t (az a lib/hooks/useNavigationSpeech.ts
// vékony, browser-hívó rétege, lásd ott). A célzott tesztlista (A-N) betűi
// itt a KRITIKUS-kör zárójelentésének sorszámozását követik.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_SPEECH_ANNOUNCER_STATE,
  buildAnnouncement,
  buildAnnouncementText,
  invalidateSpeechAnnouncerState,
  resolveSpeechDecision,
  type SpeechAnnouncerState,
} from "../../lib/vedett-route/navigation/speechAnnouncer.ts";

function announce(id: string, title: string, detail?: string) {
  return buildAnnouncement({ id, title, detail });
}

describe("buildAnnouncementText / buildAnnouncement", () => {
  test("title only, no detail", () => {
    assert.equal(buildAnnouncementText({ title: "Gyalogolj a következő pontig", detail: undefined }), "Gyalogolj a következő pontig");
  });

  test("title + detail concatenated exactly like the on-screen card", () => {
    assert.equal(
      buildAnnouncementText({ title: "Szállj fel: S40", detail: "Kelenföld vasútállomás" }),
      "Szállj fel: S40. Kelenföld vasútállomás"
    );
  });

  test("null instruction -> null announcement", () => {
    assert.equal(buildAnnouncement(null), null);
  });

  test("subState is folded into the key but never into the spoken text", () => {
    const a = buildAnnouncement({ id: "walk-2", title: "Fordulj jobbra", detail: undefined }, "TURN_RIGHT-4-NOW");
    assert.equal(a?.key, "walk-2|TURN_RIGHT-4-NOW");
    assert.equal(a?.text, "Fordulj jobbra");
  });
});

describe("resolveSpeechDecision — B/C/D: basic dedupe", () => {
  test("B) first real instruction after priming speaks once", () => {
    let state = INITIAL_SPEECH_ANNOUNCER_STATE;
    const first = announce("walk-0", "Gyalogolj: Fő tér")!;
    // Priming step (mount) — see the H) test below for why this must be silent.
    const primed = resolveSpeechDecision(state, first);
    state = primed.state;
    assert.equal(primed.shouldSpeak, false);

    const second = announce("board-1", "Szállj fel: S40")!;
    const decision = resolveSpeechDecision(state, second);
    assert.equal(decision.shouldSpeak, true);
    assert.equal(decision.state.lastKey, "board-1");
  });

  test("C) rerender with the SAME instruction never speaks twice", () => {
    let state: SpeechAnnouncerState = { lastKey: "ride-1", primed: true };
    const same = announce("ride-1", "Utazz még 3 megállót")!;
    const decision1 = resolveSpeechDecision(state, same);
    assert.equal(decision1.shouldSpeak, false);
    // A second, textually different render of the SAME logical instruction
    // (e.g. remaining-stop count ticking down under the hood) must still be
    // suppressed as long as the caller keeps the identity key stable.
    const decision2 = resolveSpeechDecision(decision1.state, same);
    assert.equal(decision2.shouldSpeak, false);
  });

  test("D) a genuinely new instruction always speaks", () => {
    let state: SpeechAnnouncerState = { lastKey: "ride-1", primed: true };
    const next = announce("alight-1", "Szállj le: Kelenföld vasútállomás")!;
    const decision = resolveSpeechDecision(state, next);
    assert.equal(decision.shouldSpeak, true);
    assert.equal(decision.state.lastKey, "alight-1");
  });
});

describe("resolveSpeechDecision — E/F/G: GPS loss / recovery / background-foreground safety", () => {
  test("E) GPS lost (announcement becomes null) never speaks and never mutates state", () => {
    const state: SpeechAnnouncerState = { lastKey: "ride-1", primed: true };
    const decision1 = resolveSpeechDecision(state, null);
    const decision2 = resolveSpeechDecision(decision1.state, null);
    const decision3 = resolveSpeechDecision(decision2.state, null);
    assert.equal(decision1.shouldSpeak, false);
    assert.equal(decision2.shouldSpeak, false);
    assert.equal(decision3.shouldSpeak, false);
    assert.deepEqual(decision3.state, state);
  });

  test("F) GPS recovery with the SAME instruction as before the loss does not replay it", () => {
    let state: SpeechAnnouncerState = { lastKey: "ride-1", primed: true };
    // GPS lost -> announcement momentarily null.
    state = resolveSpeechDecision(state, null).state;
    // GPS recovers, resolver lands back on the SAME logical instruction.
    const decision = resolveSpeechDecision(state, announce("ride-1", "Utazz még 2 megállót")!);
    assert.equal(decision.shouldSpeak, false);
  });

  test("G) background -> foreground with the same current instruction does not replay it", () => {
    // A background/foreground cycle that does not unmount the hook simply
    // re-runs the same effect with the same announcement — indistinguishable,
    // at this pure layer, from an ordinary rerender (see C).
    const state: SpeechAnnouncerState = { lastKey: "board-1", primed: true };
    const decision = resolveSpeechDecision(state, announce("board-1", "Szállj fel: S40")!);
    assert.equal(decision.shouldSpeak, false);
  });
});

describe("resolveSpeechDecision — H: navigation/session restore priming", () => {
  test("H) the FIRST announcement a fresh state ever sees is recorded silently, never spoken", () => {
    // A restored session mounts directly with a mid-journey instruction
    // already current (not starting from null) — this must not be replayed
    // just because the hook/component (re)mounted.
    const restored = announce("ride-1", "Utazz még 4 megállót")!;
    const decision = resolveSpeechDecision(INITIAL_SPEECH_ANNOUNCER_STATE, restored);
    assert.equal(decision.shouldSpeak, false);
    assert.equal(decision.state.lastKey, "ride-1");
    assert.equal(decision.state.primed, true);

    // Only a REAL subsequent change may speak.
    const nextDecision = resolveSpeechDecision(decision.state, announce("alight-1", "Szállj le: Kelenföld vasútállomás")!);
    assert.equal(nextDecision.shouldSpeak, true);
  });
});

describe("invalidateSpeechAnnouncerState — N: reroute discards stale identity", () => {
  test("N) after invalidation the next announcement speaks even if its key coincidentally repeats", () => {
    let state: SpeechAnnouncerState = { lastKey: "walk-0", primed: true };
    state = invalidateSpeechAnnouncerState();
    assert.equal(state.lastKey, null);
    assert.equal(state.primed, true);

    // The newly accepted journey's current instruction happens to reuse the
    // SAME id ("walk-0") as the old, discarded route — it must still speak,
    // because invalidation (unlike mount priming) stays armed to announce.
    const decision = resolveSpeechDecision(state, announce("walk-0", "Gyalogolj: Új útvonal első pontja")!);
    assert.equal(decision.shouldSpeak, true);
  });

  test("invalidation is NOT the same as the silent mount-priming path", () => {
    const mountState = resolveSpeechDecision(INITIAL_SPEECH_ANNOUNCER_STATE, announce("walk-0", "Gyalogolj")!);
    const rerouteState = { state: invalidateSpeechAnnouncerState(), shouldSpeak: false };
    assert.equal(mountState.shouldSpeak, false); // mount: silent
    // Reroute's invalidated state has no remembered key, so the very next
    // announcement (even identical id) is treated as a change, not a repeat.
    const afterReroute = resolveSpeechDecision(rerouteState.state, announce("walk-0", "Gyalogolj")!);
    assert.equal(afterReroute.shouldSpeak, true);
  });
});

describe("dedupe key ignores GPS-noisy remaining-stop text but reacts to discrete sub-state", () => {
  test("stop countdown ticking down under a STABLE key is suppressed (no per-fix spam)", () => {
    let state: SpeechAnnouncerState = { lastKey: null, primed: false };
    state = resolveSpeechDecision(state, announce("ride-2", "Utazz még 5 megállót")!).state; // primed, silent
    const decisions = [4, 3, 2].map((n) => {
      const d = resolveSpeechDecision(state, announce("ride-2", `Utazz még ${n} megállót`)!);
      state = d.state;
      return d.shouldSpeak;
    });
    assert.deepEqual(decisions, [false, false, false]);
  });

  test("a discrete sub-state change (e.g. near-alighting) on the SAME instruction id does speak once", () => {
    let state: SpeechAnnouncerState = { lastKey: "ride-2", primed: true };
    const decision = resolveSpeechDecision(
      state,
      announce("ride-2|NEAR_ALIGHTING", "A leszállóhely közelében vagy. Készülj a leszállásra")!
    );
    assert.equal(decision.shouldSpeak, true);
  });
});
