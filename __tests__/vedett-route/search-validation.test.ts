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

// „Aktuális helyzetem" mint indulási pont (UX módosítás, 2026-09-09),
// TASK B — H/I/M tesztek a validációs séma szintjén.

test("H) fromCoordinates önmagában (from nélkül) érvényes — CURRENT_LOCATION origin nem igényel szabadszöveges címet", () => {
  const result = journeySearchSchema.safeParse({
    fromCoordinates: { latitude: 47.4979, longitude: 19.0402 },
    to: "Budapest, Kelenföldi pályaudvar",
  });
  assert.equal(result.success, true);
});

test("from ÉS fromCoordinates EGYSZERRE megadva elutasításra kerül (a két indulási mód kölcsönösen kizárja egymást)", () => {
  const result = journeySearchSchema.safeParse({
    from: "Deák Ferenc tér",
    fromCoordinates: { latitude: 47.4979, longitude: 19.0402 },
    to: "Kelenföld",
  });
  assert.equal(result.success, false);
});

test("sem from, sem fromCoordinates nincs megadva -> elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse({ to: "Kelenföld" });
  assert.equal(result.success, false);
});

test("érvénytelen szélesség (latitude > 90) a fromCoordinates-ben elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse({
    fromCoordinates: { latitude: 91, longitude: 19.0402 },
    to: "Kelenföld",
  });
  assert.equal(result.success, false);
});

test("érvénytelen hosszúság (longitude < -180) a fromCoordinates-ben elutasításra kerül", () => {
  const result = journeySearchSchema.safeParse({
    fromCoordinates: { latitude: 47.4979, longitude: -181 },
    to: "Kelenföld",
  });
  assert.equal(result.success, false);
});

test("M) a meglévő szabadszöveges MANUAL 'from' keresés továbbra is (regresszió nélkül) működik", () => {
  const result = journeySearchSchema.safeParse({
    from: "Budapest, Deák Ferenc tér",
    to: "Budapest, Kelenföldi pályaudvar",
    departAt: new Date().toISOString(),
  });
  assert.equal(result.success, true);
});
