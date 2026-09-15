import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

const hookSource = readFileSync("lib/hooks/useScreenWakeLock.ts", "utf8");
const formSource = readFileSync("components/vedett-utvonal/VedettUtvonalSearchForm.tsx", "utf8");

describe("navigation screen wake lock", () => {
  test("a navigációs kártya a közös wake-lock hookot használja", () => {
    assert.match(formSource, /import \{ useScreenWakeLock \} from "@\/lib\/hooks\/useScreenWakeLock";/);
    assert.match(formSource, /useScreenWakeLock\(navigationMode && isOpen\);/);
  });

  test("csak screen wake lockot kér és a támogatás hiánya nem blokkol", () => {
    assert.match(hookSource, /wakeLock\?\.request/);
    assert.match(hookSource, /wakeLock\.request\("screen"\)/);
    assert.match(hookSource, /catch \{/);
  });

  test("látható oldalra visszatéréskor újrakéri a wake lockot", () => {
    assert.match(hookSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(hookSource, /document\.visibilityState === "visible"/);
    assert.match(hookSource, /void requestWakeLock\(\)/);
  });

  test("leállításkor vagy unmountkor elengedi a wake lockot", () => {
    assert.match(hookSource, /await sentinel\.release\(\)/);
    assert.match(hookSource, /return \(\) => \{/);
    assert.match(hookSource, /void releaseCurrent\(\)/);
  });

  test("egy későn beérkező request nem hagy beragadt wake lockot", () => {
    assert.match(hookSource, /generationRef\.current !== generation/);
    assert.match(hookSource, /await sentinel\.release\(\)/);
  });
});
