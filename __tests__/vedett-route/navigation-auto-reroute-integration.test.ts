import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "utf8");

describe("automatic navigation reroute integration", () => {
  it("uses the committed reroute guard instead of rerouting directly from GPS ticks", () => {
    assert.match(source, /shouldStartAutomaticReroute\(rerouteGuardRef\.current/);
    assert.match(source, /offRouteStatus:\s*routeProgress\.offRouteStatus/);
  });

  it("reuses the protected server-side resume endpoint and never calls MOTIS directly", () => {
    assert.match(source, /fetch\("\/api\/vedett-route\/rest-stops\/resume"/);
    assert.doesNotMatch(source, /fetch\([^\n]*(?:MOTIS|route\.vedettsarok|808[0-9])/i);
  });

  it("sends current GPS position and the real itinerary destination", () => {
    assert.match(source, /currentPosition:\s*attemptPosition/);
    assert.match(source, /originalDestination:\s*attemptDestination/);
    assert.match(source, /lastLeg\.toLat/);
    assert.match(source, /lastLeg\.toLon/);
  });

  it("marks the request in flight before starting the asynchronous reroute", () => {
    const mark = source.indexOf("markRerouteStarted(rerouteGuardRef.current");
    const fetch = source.indexOf('fetch("/api/vedett-route/rest-stops/resume"');
    assert.ok(mark >= 0 && fetch > mark);
  });

  it("replaces displayedJourney only after a successful fresh reroute", () => {
    assert.match(source, /if \(data\.ok\) \{\s*setDisplayedJourney\(data\.journey\)/s);
  });

  it("protects a new navigation session from stale asynchronous responses", () => {
    assert.match(source, /rerouteSessionRef\.current !== sessionId/);
    assert.match(source, /rerouteSessionRef\.current \+= 1/);
    assert.match(source, /rerouteGuardRef\.current = resetRerouteGuard\(\)/);
  });

  it("shows calm rerouting and failure feedback inside the existing OFF_ROUTE status", () => {
    assert.match(source, /routeProgress\.offRouteStatus === "OFF_ROUTE"/);
    assert.match(source, /Újratervezem az útvonalat/);
    assert.match(source, /Az automatikus újratervezés most nem sikerült/);
  });

  it("does not create a second client routing protocol", () => {
    // EARLIER TRANSIT DEPARTURE SPRINT (2026-09-22) — a MEGLÉVŐ /rest-stops/
    // resume végpontot MOST egy MÁSODIK, legitim hívási hely is használja
    // (az esemény-vezérelt korábbi-járat ellenőrzés, lásd
    // lib/vedett-route/navigation/earlierDeparture.ts) — ez UGYANAZT a
    // MEGLÉVŐ, egyetlen szerver-oldali route-protokollt hívja, nem egy ÚJ
    // client-oldali routing service-t (a lenti "no second protocol" ellenőrzés
    // ezt még mindig garantálja: nincs új /navigation/reroute vagy hasonló
    // endpoint).
    const resumeCalls = source.match(/fetch\("\/api\/vedett-route\/rest-stops\/resume"/g) ?? [];
    assert.equal(resumeCalls.length, 2);
    assert.doesNotMatch(source, /\/api\/vedett-route\/navigation\/reroute/);
  });
});
