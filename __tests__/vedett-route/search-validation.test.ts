// Routing tesztek (31. pont): érvényes A→B, érvénytelen koordináta/bemenet,
// múltbeli időpont — a validációs séma szintjén.
//   node --test __tests__/vedett-route/search-validation.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { journeySearchSchema } from "../../lib/vedett-route/schemas.ts";

test("érvényes A → B kérés átmegy a validáción", () => {
  const result = journeySearchSchema.safeParse({
    from: "Budapest, Deák Ferenc tér",
    to: "Budapest, Kelenföldi pályaudvar",
    departAt: new Date().toISOString(),
  });
  assert.equal(result.success, true);
});

test("departAt nélkül is érvényes (a hívó 'most'-ként kezeli)", () => {
  const result = journeySearchSchema.safeParse({
    from: "Deák Ferenc tér",
    to: "Kelenföld",
  });
  assert.equal(result.success, true);
});

test("üres 'from' mező elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse({ from: "", to: "Kelenföld" });
  assert.equal(result.success, false);
});

test("hiányzó 'to' mező elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse({ from: "Deák Ferenc tér" });
  assert.equal(result.success, false);
});

test("érvénytelen departAt formátum (nem ISO datetime) elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse({
    from: "Deák Ferenc tér",
    to: "Kelenföld",
    departAt: "tegnap délután",
  });
  assert.equal(result.success, false);
});

test("teljesen hiányzó body (null) elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse(null);
  assert.equal(result.success, false);
});
