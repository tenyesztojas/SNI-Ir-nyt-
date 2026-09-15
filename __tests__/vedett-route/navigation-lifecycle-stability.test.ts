import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const formSrc = fs.readFileSync(path.join(root, "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const hookSrc = fs.readFileSync(path.join(root, "lib/hooks/useRouteNavigation.ts"), "utf8");

describe("Navigation lifecycle stability", () => {
  test("currentPosition memoizált, ezért változatlan GPS-fix nem gyárt új objektumreferenciát", () => {
    assert.match(formSrc, /const currentPosition = useMemo\(/);
    assert.match(formSrc, /geo\.timestampMs\],\s*\);/);
  });

  test("routeNavigationPosition is memoizált", () => {
    assert.match(formSrc, /const routeNavigationPosition = useMemo\(/);
    assert.match(formSrc, /\[currentPosition\],\s*\);/);
  });

  test("a hook explicit active paramétert kap", () => {
    assert.match(hookSrc, /active = true,/);
    assert.match(formSrc, /navigationMode,\s*\);/);
  });

  test("inaktív navigációban GPS-fix nem futtat route progress számítást", () => {
    assert.match(hookSrc, /if \(!active \|\| !position \|\| routeCoordinates\.length < 2\) return;/);
  });

  test("route vagy active session-váltás reseteli az előző progress állapotot", () => {
    assert.match(hookSrc, /previousRef\.current = null;/);
    assert.match(hookSrc, /\[routeCoordinates, active\]/);
  });

  test("az update effect active változásra is reagál", () => {
    assert.match(hookSrc, /\[active, position, routeCoordinates,/);
  });
});
