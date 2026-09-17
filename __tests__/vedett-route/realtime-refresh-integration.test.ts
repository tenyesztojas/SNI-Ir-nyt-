// Sprint 7.2 (LIVE TRANSIT REALTIME REFRESH) — minimális, célzott wiring-
// ellenőrzés (ugyanaz a forrás-alapú minta, mint
// navigation-auto-reroute-integration.test.ts), NEM egy második teljes
// audit — csak azt rögzíti, hogy a hook bekötése a specifikáció szerint
// történt: functional setDisplayedJourney update, meglévő session-guard
// reuse, sosem blind full-Journey replace.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "utf8");

describe("live transit realtime refresh integration", () => {
  it("a functional setDisplayedJourney(prev => mergeRealtimeUpdates(...)) mintát használja, sosem blind full-journey replace-t", () => {
    assert.match(source, /onUpdates:\s*\(updates\)\s*=>\s*setDisplayedJourney\(\(prev\)\s*=>\s*mergeRealtimeUpdates\(prev,\s*updates\)\)/);
  });

  it("a meglévő rerouteSessionRef-et használja session-guardként (nincs második, párhuzamos session-mechanizmus)", () => {
    assert.match(source, /sessionId:\s*rerouteSessionRef\.current/);
  });

  it("a rest-stop resume is új realtime-refresh sessiont nyit", () => {
    const resumeHandlerIndex = source.indexOf("onRouteResumed={(nextJourney)");
    const nextIncrement = source.indexOf("rerouteSessionRef.current += 1", resumeHandlerIndex);
    assert.ok(resumeHandlerIndex >= 0 && nextIncrement > resumeHandlerIndex && nextIncrement < resumeHandlerIndex + 400);
  });

  it("a rest-stop legsOverride és a rerouting állapot elnyomja a pollingot", () => {
    assert.match(source, /hasRestStopOverride:\s*Boolean\(restStopMapState\.active && restStopMapState\.legsOverride\)/);
    assert.match(source, /isRerouting:\s*automaticRerouteStatus === "REROUTING"/);
  });
});
