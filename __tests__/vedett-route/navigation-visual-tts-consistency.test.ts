// NAVIGATION — VISUAL/TTS SINGLE SOURCE OF TRUTH regressziós teszt
// (2026-09-25, Kredit-KRITIKUS szűk kör, A) rész).
//
// AUDIT EREDMÉNYE (lásd a záró jelentés "1 VISUAL/TTS CONSISTENCY" pontja):
// a vizuális kártya (VedettUtvonalSearchForm.tsx, ~2753/2761. sor:
// navigationInstructionForDisplay.title / .detail) ÉS a TTS
// (buildAnnouncement(navigationInstructionForDisplay, speechSubState),
// ugyanott ~1712. sor) UGYANARRÓL a `navigationInstructionForDisplay`
// objektumról olvas — nincs külön TTS-oldali távolság-/manőver-/
// megállószám-/irány-/boarding-számítás, a speechAnnouncer.ts
// buildAnnouncementText() szó szerint a title/detail mezőket fűzi össze.
//
// Ez a teszt NEM refaktorál semmit — csak egy célzott regressziós ellenőrzés,
// hogy a selectActiveInstructionWithStopProgress() (instructions.ts) és a
// walk-manőver-alapú title-felülírás (a hívó oldali mintát reprodukálva)
// kimenete pontosan azt a szöveget adja, amit buildAnnouncement()
// (speechAnnouncer.ts) kimondana — vagyis a két csatorna soha nem térhet
// el, amíg mindkettő ugyanazt az objektumot kapja.
//
//   node --test --experimental-strip-types __tests__/vedett-route/navigation-visual-tts-consistency.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildNavigationInstructions,
  selectActiveInstructionWithStopProgress,
} from "../../lib/vedett-route/navigation/instructions.ts";
import { buildAnnouncement, buildAnnouncementText } from "../../lib/vedett-route/navigation/speechAnnouncer.ts";
import { buildWalkInstructionText } from "../../lib/vedett-route/navigation/walkManoeuvreProgress.ts";

describe("visual card and TTS read the same canonical instruction object", () => {
  test("onboard RIDE with reliable stop-progress: card title/detail === spoken text", () => {
    const journey = {
      legs: [
        {
          mode: "TRANSIT" as const,
          transitMode: "BUS",
          routeShortName: "S40",
          headsign: "Dombóvár",
          fromName: "Kelenföld vasútállomás",
          toName: "Székesfehérvár",
          intermediateStops: [],
        },
      ],
    };
    const instructions = buildNavigationInstructions(journey as any);

    // A hívó (VedettUtvonalSearchForm.tsx) pontosan EZT az objektumot adja
    // tovább MIND a kártyának, MIND buildAnnouncement()-nek —
    // navigationInstructionForDisplay.
    const active = selectActiveInstructionWithStopProgress(instructions, {
      legIndex: 0,
      onboard: true,
      remainingStops: { remainingStopCount: 3, atFinalStop: false },
      nextStopName: "Tárnok",
    });
    const navigationInstructionForDisplay = active.current;
    assert.ok(navigationInstructionForDisplay);

    // Vizuális kártya (lásd a fenti fejléc sorhivatkozása).
    const cardText = navigationInstructionForDisplay!.detail
      ? `${navigationInstructionForDisplay!.title}. ${navigationInstructionForDisplay!.detail}`
      : navigationInstructionForDisplay!.title;

    // TTS.
    const announcement = buildAnnouncement(navigationInstructionForDisplay);
    assert.ok(announcement);
    assert.equal(announcement!.text, cardText);
    assert.equal(announcement!.text, buildAnnouncementText(navigationInstructionForDisplay!));
  });

  test("WALK leg with an active turn manoeuvre: title override is shared verbatim by card and TTS", () => {
    const journey = {
      legs: [{ mode: "WALK" as const, toName: "Móricz Zsigmond körtér" }],
    };
    const instructions = buildNavigationInstructions(journey as any);
    const base = selectActiveInstructionWithStopProgress(instructions, { legIndex: 0 });
    assert.equal(base.current?.kind, "WALK");

    // A hívó a walk-manőver alapú title-felülírást UGYANÚGY építi fel,
    // mielőtt navigationInstructionForDisplay-ként átadná mindkét
    // csatornának (lásd VedettUtvonalSearchForm.tsx
    // activeNavigationInstructionWithWalkProgress) — itt ugyanazt a
    // meglévő, pure buildWalkInstructionText()-et hívjuk, amit a hívó is.
    const manoeuvre = { kind: "TURN_RIGHT" as const, segmentIndex: 3, distanceFromStartMeters: 40, distanceFromPreviousMeters: 40, turnAngleDegrees: 55 };
    const title = buildWalkInstructionText(manoeuvre, "NOW", 0);
    const navigationInstructionForDisplay = { ...base.current!, title, detail: undefined };

    const cardText = navigationInstructionForDisplay.title;
    const announcement = buildAnnouncement(navigationInstructionForDisplay, `${manoeuvre.kind}-${manoeuvre.segmentIndex}-NOW`);
    assert.equal(announcement!.text, cardText);
  });
});
