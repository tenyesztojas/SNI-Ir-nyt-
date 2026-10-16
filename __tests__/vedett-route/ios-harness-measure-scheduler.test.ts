// VÉDETT ÚTVONAL — iOS-szimulátoros tesztoldal: mérésütemező (versenyhelyzet-javítás)
//   node --test __tests__/vedett-route/ios-harness-measure-scheduler.test.ts
//
// Valós eset (ios-navigation-layout-4, iPhone 17 Pro, 402×812): az induláskori
// WKWebView-resize 12:50:57-kor `after-resize-portrait` mérést indított
// (mapControls: []), a kezdeti mérés csak 12:51:01-kor futott. Mind a négy
// álló készüléken a resize-mérés megelőzte az initial mérést.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createMeasureScheduler,
  type Orientation,
} from "../../app/(vu-test-harness)/vu-nav-layout-harness/measureScheduler.ts";

function harnessFixture(startOrientation: Orientation = "portrait") {
  let orientation: Orientation = startOrientation;
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const phases: string[] = [];
  let active = 0;
  let maxActive = 0;
  const gates: Array<() => void> = [];
  let manual = false;
  const scheduler = createMeasureScheduler({
    currentOrientation: () => orientation,
    measure: async (phase) => {
      // A riport a mérés pillanatának tájolását rögzíti (a mérés elején olvassuk).
      const measured = orientation;
      active++;
      maxActive = Math.max(maxActive, active);
      phases.push(phase);
      if (manual) await new Promise<void>((r) => gates.push(r));
      else await Promise.resolve();
      active--;
      return measured;
    },
    setTimer: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id as number);
    },
    resizeDebounceMs: 3000,
  });
  return {
    scheduler,
    phases,
    get maxActive() {
      return maxActive;
    },
    pendingTimers: () => timers.size,
    setOrientation: (o: Orientation) => {
      orientation = o;
    },
    fireTimers: () => {
      const fns = [...timers.values()];
      timers.clear();
      fns.forEach((fn) => fn());
    },
    holdMeasurements: () => {
      manual = true;
    },
    releaseOne: () => gates.shift()?.(),
    flush: () => new Promise((r) => setTimeout(r, 0)),
  };
}

describe("iOS tesztoldal — mérésütemező", () => {
  test("korai resize (a kezdeti mérés előtt) NEM indít mérést — csak az initial fut", async () => {
    const h = harnessFixture();
    h.scheduler.onResize();
    h.scheduler.onResize();
    assert.equal(h.pendingTimers(), 0, "a kezdeti mérés előtt resize-időzítő sem indulhat");
    h.fireTimers();
    await h.scheduler.runInitial();
    await h.scheduler.idle();
    assert.deepEqual(h.phases, ["initial"]);
  });

  test("tájolásváltás a kezdeti mérés után: after-resize-landscape mérés fut (fekvő teszt)", async () => {
    const h = harnessFixture();
    await h.scheduler.runInitial();
    h.setOrientation("landscape");
    h.scheduler.onResize();
    h.fireTimers();
    await h.flush();
    await h.scheduler.idle();
    assert.deepEqual(h.phases, ["initial", "after-resize-landscape"]);
  });

  test("tájolást nem változtató resize a kezdeti mérés után nem indít felesleges mérést", async () => {
    const h = harnessFixture();
    await h.scheduler.runInitial();
    h.scheduler.onResize();
    h.fireTimers();
    await h.flush();
    await h.scheduler.idle();
    assert.deepEqual(h.phases, ["initial"]);
  });

  test("a mérések sosem futnak párhuzamosan; a sorban álló resize-mérés a futó után indul", async () => {
    const h = harnessFixture();
    await h.scheduler.runInitial();
    h.holdMeasurements();
    h.setOrientation("landscape");
    h.scheduler.onResize();
    h.fireTimers();
    await h.flush();
    assert.deepEqual(h.phases, ["initial", "after-resize-landscape"]);
    h.setOrientation("portrait");
    h.scheduler.onResize();
    h.fireTimers();
    await h.flush();
    assert.deepEqual(h.phases, ["initial", "after-resize-landscape"], "a második mérés nem indulhat el, amíg az első fut");
    h.releaseOne();
    await h.flush();
    await h.flush();
    assert.deepEqual(h.phases, ["initial", "after-resize-landscape", "after-resize-portrait"]);
    h.releaseOne();
    await h.scheduler.idle();
    assert.equal(h.maxActive, 1);
  });

  test("a kezdeti mérés KÖZBEN bekövetkező tájolásváltást a kezdeti mérés után pótolja", async () => {
    const h = harnessFixture();
    h.holdMeasurements();
    const initial = h.scheduler.runInitial();
    await h.flush();
    h.setOrientation("landscape");
    h.scheduler.onResize(); // a kezdeti mérés még fut → figyelmen kívül hagyva
    assert.equal(h.pendingTimers(), 0);
    h.releaseOne(); // initial kész (álló tájolást mért → a riport portrait)
    await initial;
    await h.flush();
    h.releaseOne();
    await h.scheduler.idle();
    assert.equal(h.phases[0], "initial");
    assert.equal(h.phases.length, 2);
    assert.equal(h.maxActive, 1);
  });

  test("sikertelen kezdeti mérés után a resize továbbra sem indít mérést", async () => {
    let calls = 0;
    const scheduler = createMeasureScheduler({
      currentOrientation: () => "landscape",
      measure: async () => {
        calls++;
        throw new Error("mérési hiba");
      },
      setTimer: (fn) => (fn(), 1),
      clearTimer: () => {},
      resizeDebounceMs: 0,
    });
    await scheduler.runInitial();
    scheduler.onResize();
    await scheduler.idle();
    assert.equal(calls, 1);
  });
});

describe("iOS tesztoldal — Harness bekötés (forrás-szint)", () => {
  const h = readFileSync("app/(vu-test-harness)/vu-nav-layout-harness/Harness.tsx", "utf8");

  test("a resize az ütemezőn keresztül fut, a kezdeti mérés az ütemező runInitial-ja", () => {
    assert.match(h, /window\.addEventListener\("resize", scheduler\.onResize\);/);
    assert.match(h, /await scheduler\.runInitial\(\);/);
    assert.doesNotMatch(h, /void run\(`after-resize-/, "közvetlen (ütemező nélküli) resize-mérés nem maradhat");
  });

  test("a térképvezérlőkre korlátozott ideig vár, és utána is ténylegesen mér (hiány = hiba)", () => {
    assert.match(h, /const MAP_CONTROLS_TIMEOUT_MS = 15_000;/);
    assert.match(h, /await waitFor\(\(\) => visibleMapControlCount\(\) > 0, MAP_CONTROLS_TIMEOUT_MS\);\s*\n\s*const report = await measure\(phase, restFlowOk\);/);
    assert.match(h, /if \(mapControls\.length === 0\) problems\.push\("hiányzó elem: térképvezérlők"\);/);
  });

  test("az assert-simulator-report.mjs ellenőrzései változatlanok (térképvezérlő, restFlowOk, safe-area)", () => {
    const a = readFileSync("e2e/assert-simulator-report.mjs", "utf8");
    assert.match(a, /report\.mapControls\.length === 0\) failures\.push\("hiányzó térképvezérlők"\)/);
    assert.match(a, /restFlowOk === true\)\) failures\.push/);
    assert.match(a, /a natív safe-area válasz hiányos/);
  });
});
