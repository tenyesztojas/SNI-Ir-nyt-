// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — a 4 másodperces
// ideiglenes kamera-override viselkedésének VALÓDI, node:test mock.timers-
// szel fedett tesztjei (nincs jsdom/React-render — a followResumeTimer.ts
// keretrendszer-független, közvetlenül tesztelhető).

import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { FOLLOW_RESUME_DELAY_MS, createFollowResumeTimer } from "../../lib/vedett-route/navigation/followResumeTimer.ts";

describe("createFollowResumeTimer — gesztus utáni ideiglenes override, fake timerrel", () => {
  test("gesztus után 3999 ms-nál MÉG NEM hívja az onResume-ot", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resumed = false;
      const timer = createFollowResumeTimer(() => {
        resumed = true;
      });
      timer.onUserGesture();
      mock.timers.tick(FOLLOW_RESUME_DELAY_MS - 1);
      assert.equal(resumed, false);
    } finally {
      mock.timers.reset();
    }
  });

  test("pontosan 4000 ms-nál meghívja az onResume-ot (recenter/follow visszaáll)", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resumed = false;
      const timer = createFollowResumeTimer(() => {
        resumed = true;
      });
      timer.onUserGesture();
      mock.timers.tick(FOLLOW_RESUME_DELAY_MS);
      assert.equal(resumed, true);
    } finally {
      mock.timers.reset();
    }
  });

  test("egy ÚJABB gesztus a timert újraindítja (restart 4000 ms) — a korábbi ablak lejárta önmagában nem hív onResume-ot", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resumeCount = 0;
      const timer = createFollowResumeTimer(() => {
        resumeCount += 1;
      });
      timer.onUserGesture();
      mock.timers.tick(3_000);
      // Új gesztus 3000 ms-nál — a régi (1000 ms múlva lejáró) timer törlődik,
      // egy TELJES, új 4000 ms-os timer indul.
      timer.onUserGesture();
      mock.timers.tick(3_000);
      assert.equal(resumeCount, 0, "a régi timer óta eltelt idő NEM összegződik — az újraindított timer még nem járt le");
      mock.timers.tick(1_000);
      assert.equal(resumeCount, 1, "az ÚJRAINDÍTOTT timer a SAJÁT 4000 ms-a után jár le pontosan egyszer");
    } finally {
      mock.timers.reset();
    }
  });

  test("explicit recenter (cancel()) törli a timert — a lejárati időpontban NEM hívódik az onResume", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resumed = false;
      const timer = createFollowResumeTimer(() => {
        resumed = true;
      });
      timer.onUserGesture();
      mock.timers.tick(1_000);
      timer.cancel();
      mock.timers.tick(FOLLOW_RESUME_DELAY_MS);
      assert.equal(resumed, false);
    } finally {
      mock.timers.reset();
    }
  });

  test("unmount/navigáció vége (cancel()) egy MÉG el nem indult gesztus esetén is biztonságos (nincs mit törölni)", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const timer = createFollowResumeTimer(() => {
        throw new Error("nem szabadna meghívódnia");
      });
      assert.doesNotThrow(() => timer.cancel());
      mock.timers.tick(FOLLOW_RESUME_DELAY_MS);
    } finally {
      mock.timers.reset();
    }
  });

  test("cancel() UTÁN egy ÚJ gesztus önállóan újra tud indulni (a controller élettartama a cancel() után is folytatódik)", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resumeCount = 0;
      const timer = createFollowResumeTimer(() => {
        resumeCount += 1;
      });
      timer.onUserGesture();
      timer.cancel();
      timer.onUserGesture();
      mock.timers.tick(FOLLOW_RESUME_DELAY_MS);
      assert.equal(resumeCount, 1);
    } finally {
      mock.timers.reset();
    }
  });
});
