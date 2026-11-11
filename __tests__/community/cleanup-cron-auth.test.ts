// Közösségi cleanup cron: fail-closed hitelesítés (hiányzó/üres CRON_SECRET).
//   node --test --experimental-strip-types __tests__/community/cleanup-cron-auth.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCleanupCronAuthorized } from "../../lib/community/cronAuth.ts";

describe("community-report-cleanup cron hitelesítés", () => {
  test("hiányzó vagy üres CRON_SECRET: minden hívás elutasítva (a régi „Bearer undefined” rés zárva)", () => {
    for (const header of [null, "", "Bearer undefined", "Bearer ", "Bearer null", "Bearer x"]) {
      assert.equal(isCleanupCronAuthorized(header, undefined), false, String(header));
      assert.equal(isCleanupCronAuthorized(header, ""), false, String(header));
    }
  });

  test("beállított titok: csak a pontos Bearer fejléc fogadható el", () => {
    const secret = "teszt-cron-titok-1234";
    assert.equal(isCleanupCronAuthorized(`Bearer ${secret}`, secret), true);
    for (const header of [null, "", secret, `bearer ${secret}`, `Bearer ${secret} `, `Bearer ${secret}x`, "Bearer undefined"]) {
      assert.equal(isCleanupCronAuthorized(header, secret), false, String(header));
    }
  });

  test("a route a fail-closed ellenőrzést használja, a régi összehasonlítás eltűnt", () => {
    const route = readFileSync("app/api/cron/community-report-cleanup/route.ts", "utf8");
    assert.match(route, /if \(!isCleanupCronAuthorized\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)\)/);
    assert.doesNotMatch(route, /authHeader !== `Bearer \$\{process\.env\.CRON_SECRET\}`/);
    assert.ok(route.indexOf("isCleanupCronAuthorized(") < route.indexOf("createAdminClient()"), "hitelesítés az admin kliens előtt");
    // a route csak engedélyezett Next.js exportokat ad ki
    const exports = [...route.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]).sort();
    assert.deepEqual(exports, ["GET", "dynamic", "runtime"]);
  });

  test("a többi cron route hiányzó CRON_SECRET-nél leáll (változatlan)", () => {
    for (const f of ["akademia-emlekeztetok", "expire-vedettmunka-jobs", "send-weekly-job-alerts"]) {
      const r = readFileSync(`app/api/cron/${f}/route.ts`, "utf8");
      assert.match(r, /if \(!secret\) \{\s*return NextResponse\.json\(\{ error: "CRON_SECRET nincs konfigurálva\." \}, \{ status: 500 \}\);/, f);
    }
    assert.match(readFileSync("app/api/cron/vedett-route-community-load/route.ts", "utf8"), /isAuthorizedCronRequest\(/);
  });
});
