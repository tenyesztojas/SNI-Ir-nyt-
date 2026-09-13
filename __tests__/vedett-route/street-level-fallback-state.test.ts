// Regressziós tesztek — STREET-LEVEL FALLBACK ÁLLAPOT-ÁTMENETEK
// (2026-09-12, hardening #3 — confirmation state invariánsok)
//
// Bizonyítja, hogy a house_number_not_resolved megerősítési folyamat
// állapot-átmenetei megfelelnek a spec-nek:
//
//   A) house_number_not_resolved API válasz feldolgozása
//      → PENDING_CONFIRMATION, pendingStreetLevelResubmit = false
//      → routing NEM indul automatikusan
//
//   B) Felhasználói ACCEPT ("Az utca közelítő helyével tervezek")
//      → ACCEPTED, MAP_PICKED koordinátával, pendingStreetLevelResubmit = true
//      → React useEffect → formRef.current?.requestSubmit() → routing indul
//
//   C) Felhasználói MODIFY ("Módosítom a címet")
//      → DISMISSED, pendingStreetLevelResubmit = false
//      → routing NEM indul
//
//   D) buildSearchRequestDestinationFields(MAP_PICKED)
//      → toCoordinates + toName, NEM `to` address string
//      → szerver NEM hívja a geocodeAddress()-t
//
//   E) buildSearchRequestDestinationFields(MANUAL)
//      → `to` address string, NEM toCoordinates
//      → szerver geocodeAddress()-t hív (nem routing automatikusan)
//
// Run: node --test __tests__/vedett-route/street-level-fallback-state.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  processHouseNumberNotResolved,
  acceptStreetLevel,
  modifyStreetLevel,
  type ApproximateStreetLocation,
} from "../../lib/vedett-route/streetLevelFallbackState.ts";

import {
  buildSearchRequestDestinationFields,
  buildSearchRequestOriginFields,
} from "../../lib/vedett-route/searchRequestBuilder.ts";

// ─── Segéd-adat ──────────────────────────────────────────────────────────────

const bakonynanaStreet: ApproximateStreetLocation = {
  name: "Alkotmány utca, 8422 Bakonynána, Magyarország",
  lat: 47.42,
  lon: 18.06,
  resolvedStreet: "Alkotmány utca",
  resolvedCity: "Bakonynána",
};

const balatonszepezdStreet: ApproximateStreetLocation = {
  name: "Petőfi utca, 8252 Balatonszepezd, Magyarország",
  lat: 46.820,
  lon: 17.580,
  resolvedStreet: "Petőfi utca",
  resolvedCity: "Balatonszepezd",
};

// ─── Teszt A — house_number_not_resolved válasz → PENDING, nincs auto-submit ──

describe("Teszt A — processHouseNumberNotResolved() → PENDING_CONFIRMATION, resubmit=false", () => {
  test("Destination (to) field: PENDING_CONFIRMATION + pendingStreetLevelResubmit === false", () => {
    const state = processHouseNumberNotResolved("to", bakonynanaStreet);

    assert.strictEqual(
      state.status,
      "PENDING_CONFIRMATION",
      "Status PENDING_CONFIRMATION — a kártya megjelenik, UI vár a döntésre"
    );
    assert.strictEqual(
      state.field,
      "to",
      "Field 'to' — a destination oldali kártya aktív"
    );
    assert.strictEqual(
      state.pendingStreetLevelResubmit,
      false,
      "pendingStreetLevelResubmit === false — routing NEM indul automatikusan"
    );
    assert.deepStrictEqual(
      state.approximateLocation,
      bakonynanaStreet,
      "Az approximate location preserválva van"
    );
  });

  test("Origin (from) field: PENDING_CONFIRMATION + pendingStreetLevelResubmit === false", () => {
    const state = processHouseNumberNotResolved("from", balatonszepezdStreet);

    assert.strictEqual(state.status, "PENDING_CONFIRMATION");
    assert.strictEqual(state.field, "from");
    assert.strictEqual(
      state.pendingStreetLevelResubmit,
      false,
      "pendingStreetLevelResubmit === false — origin oldalon sincs auto-submit"
    );
  });

  test("PENDING állapotban nincs MAP_PICKED destination — MANUAL state marad", () => {
    // A PENDING state NEM tartalmaz mapPickedDestination-t.
    // buildSearchRequestDestinationFields(MANUAL) → `to` string → nincs auto-routing.
    const state = processHouseNumberNotResolved("to", bakonynanaStreet);

    // A state nem ACCEPTED → nincs mapPickedDestination
    assert.ok(
      !("mapPickedDestination" in state),
      "PENDING state NEM tartalmaz mapPickedDestination-t — MANUAL state marad"
    );

    // Ha a következő submit-kísérlet MANUAL destination-nel indul:
    const requestFields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Bakonynána",
      districtOrPostalCode: "8422",
      street: "Alkotmány utca 15",
    });
    assert.ok(
      !("toCoordinates" in requestFields),
      "MANUAL destination → NEM toCoordinates (nincs auto-routing)"
    );
    assert.ok(
      "to" in requestFields,
      "MANUAL destination → 'to' string (szerver geocodeAddress()-t hívna)"
    );
  });
});

// ─── Teszt B — ACCEPT → MAP_PICKED koordinátával, resubmit=true ──────────────

describe("Teszt B — acceptStreetLevel() → ACCEPTED, MAP_PICKED, resubmit=true", () => {
  test("ACCEPTED állapot: status, pendingStreetLevelResubmit, mapPickedDestination.type", () => {
    const pending = processHouseNumberNotResolved("to", bakonynanaStreet);
    const accepted = acceptStreetLevel(pending);

    assert.strictEqual(
      accepted.status,
      "ACCEPTED",
      "Status ACCEPTED — a jóváhagyás megtörtént"
    );
    assert.strictEqual(
      accepted.pendingStreetLevelResubmit,
      true,
      "pendingStreetLevelResubmit === true → React useEffect → requestSubmit() indul"
    );
    assert.strictEqual(
      accepted.mapPickedDestination.type,
      "MAP_PICKED",
      "mapPickedDestination.type === MAP_PICKED"
    );
  });

  test("MAP_PICKED koordináták megegyeznek az approximate location-nel", () => {
    const pending = processHouseNumberNotResolved("to", bakonynanaStreet);
    const accepted = acceptStreetLevel(pending);

    assert.strictEqual(
      accepted.mapPickedDestination.latitude,
      bakonynanaStreet.lat,
      "Latitude preserválva"
    );
    assert.strictEqual(
      accepted.mapPickedDestination.longitude,
      bakonynanaStreet.lon,
      "Longitude preserválva"
    );
  });

  test("MAP_PICKED name = 'resolvedStreet, resolvedCity' összeállítva", () => {
    const pending = processHouseNumberNotResolved("to", bakonynanaStreet);
    const accepted = acceptStreetLevel(pending);

    assert.strictEqual(
      accepted.mapPickedDestination.name,
      "Alkotmány utca, Bakonynána",
      "Name = resolvedStreet + resolvedCity"
    );
  });

  test("MAP_PICKED name fallback: ha nincs resolvedStreet/City → 'Utca közelítő helye'", () => {
    const pending = processHouseNumberNotResolved("to", {
      name: "ismeretlen utca",
      lat: 47.5,
      lon: 19.0,
      // resolvedStreet és resolvedCity hiányzik
    });
    const accepted = acceptStreetLevel(pending);

    assert.strictEqual(
      accepted.mapPickedDestination.name,
      "Utca közelítő helye",
      "Fallback name: 'Utca közelítő helye'"
    );
  });

  test("ACCEPTED állapot mapPickedDestination-ja → buildSearchRequestDestinationFields(MAP_PICKED) → toCoordinates", () => {
    // Teljes folyamat bizonyítása: ACCEPT → MAP_PICKED → request body toCoordinates
    const pending = processHouseNumberNotResolved("to", bakonynanaStreet);
    const accepted = acceptStreetLevel(pending);

    // A React component a mapPickedDestination-t setDestination()-nal állítja be,
    // majd requestSubmit() → handleSubmit → buildSearchRequestDestinationFields(MAP_PICKED)
    const requestFields = buildSearchRequestDestinationFields(
      accepted.mapPickedDestination
    );

    assert.ok(
      "toCoordinates" in requestFields,
      "MAP_PICKED → toCoordinates jelen van (NEM re-geokódol)"
    );
    assert.deepStrictEqual(
      requestFields.toCoordinates,
      { latitude: bakonynanaStreet.lat, longitude: bakonynanaStreet.lon },
      "toCoordinates egyezik az approximate location koordinátáival"
    );
    assert.ok(
      !("to" in requestFields),
      "MAP_PICKED → NEM 'to' string (nem indul új geocodeAddress() hívás)"
    );
  });
});

// ─── Teszt C — MODIFY → DISMISSED, nincs auto-submit ─────────────────────────

describe("Teszt C — modifyStreetLevel() → DISMISSED, resubmit=false", () => {
  test("DISMISSED állapot: status, pendingStreetLevelResubmit", () => {
    const dismissed = modifyStreetLevel();

    assert.strictEqual(
      dismissed.status,
      "DISMISSED",
      "Status DISMISSED — hibaállapot törlődik"
    );
    assert.strictEqual(
      dismissed.pendingStreetLevelResubmit,
      false,
      "pendingStreetLevelResubmit === false — routing NEM indul"
    );
  });

  test("DISMISSED állapotban nincs mapPickedDestination", () => {
    const dismissed = modifyStreetLevel();
    assert.ok(
      !("mapPickedDestination" in dismissed),
      "DISMISSED state NEM tartalmaz mapPickedDestination-t"
    );
  });

  test("MODIFY után a felhasználó MANUAL state-ben marad — nincs koordináta a requestben", () => {
    // A MODIFY ág setStreetLevelTo(null) + setResult(null) → UI szerkeszthető
    // Ha a felhasználó újra beküldi (változtatás nélkül), MANUAL megy:
    const requestFields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Balatonszepezd",
      districtOrPostalCode: "8252",
      street: "Petőfi utca 33",
    });

    assert.ok(
      !("toCoordinates" in requestFields),
      "MODIFY ág: toCoordinates NEM szerepel — nincs auto-routing"
    );
    assert.strictEqual(
      requestFields.to,
      "8252 Balatonszepezd, Petőfi utca 33",
      "MODIFY ág: 'to' string megy → szerver geocodeAddress()-t hívna"
    );
  });
});

// ─── Teszt D — buildSearchRequestDestinationFields(MAP_PICKED) → toCoordinates ─

describe("Teszt D — buildSearchRequestDestinationFields(MAP_PICKED) → toCoordinates + toName, nincs 'to'", () => {
  test("MAP_PICKED destination → { toCoordinates, toName }, NEM 'to'", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "MAP_PICKED",
      name: "Alkotmány utca, Bakonynána",
      latitude: 47.42,
      longitude: 18.06,
    });

    assert.ok(
      "toCoordinates" in fields,
      "MAP_PICKED: toCoordinates jelen van"
    );
    assert.deepStrictEqual(
      fields.toCoordinates,
      { latitude: 47.42, longitude: 18.06 },
      "toCoordinates értéke helyes"
    );
    assert.strictEqual(
      fields.toName,
      "Alkotmány utca, Bakonynána",
      "toName értéke helyes"
    );
    assert.ok(
      !("to" in fields),
      "MAP_PICKED: 'to' address string NEM szerepel"
    );
  });

  test("KNOWN_PLACE destination → toCoordinates (nem geokódol újra)", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "KNOWN_PLACE",
      name: "VédettSarok Pécs",
      latitude: 46.07,
      longitude: 18.23,
    });

    assert.ok("toCoordinates" in fields);
    assert.ok(!("to" in fields));
  });
});

// ─── Teszt E — buildSearchRequestDestinationFields(MANUAL) → 'to' string ──────

describe("Teszt E — buildSearchRequestDestinationFields(MANUAL) → 'to' address string, nincs toCoordinates", () => {
  test("MANUAL destination → { to: '...' }, NEM toCoordinates", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Bakonynána",
      districtOrPostalCode: "8422",
      street: "Alkotmány utca 15",
    });

    assert.ok(
      !("toCoordinates" in fields),
      "MANUAL: toCoordinates NEM szerepel"
    );
    assert.ok(
      "to" in fields && typeof fields.to === "string",
      "MANUAL: 'to' string mező jelen van"
    );
    assert.strictEqual(
      fields.to,
      "8422 Bakonynána, Alkotmány utca 15",
      "Irányítószámos cím-string formátuma helyes"
    );
  });

  test("Kerületes cím → 'Város, kerület, utca' formátum", () => {
    const fields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Budapest",
      districtOrPostalCode: "VIII. kerület",
      street: "Rákóczi út 15",
    });

    assert.strictEqual(
      fields.to,
      "Budapest, VIII. kerület, Rákóczi út 15"
    );
  });

  test("buildSearchRequestOriginFields(MANUAL) → 'from' string, NEM fromCoordinates", () => {
    const fields = buildSearchRequestOriginFields({
      type: "MANUAL",
      city: "Bakonynána",
      districtOrPostalCode: "8422",
      street: "Alkotmány utca 15",
    });

    assert.ok(!("fromCoordinates" in fields));
    assert.strictEqual(fields.from, "8422 Bakonynána, Alkotmány utca 15");
  });

  test("buildSearchRequestOriginFields(CURRENT_LOCATION) → fromCoordinates, NEM 'from' string", () => {
    const fields = buildSearchRequestOriginFields({
      type: "CURRENT_LOCATION",
      latitude: 47.497,
      longitude: 19.040,
    });

    assert.ok("fromCoordinates" in fields);
    assert.ok(!("from" in fields));
    assert.ok(!("fromName" in fields), "CURRENT_LOCATION: fromName NEM szerepel");
  });

  test("buildSearchRequestOriginFields(MAP_PICKED) → fromCoordinates + fromName, NEM 'from' string", () => {
    const fields = buildSearchRequestOriginFields({
      type: "MAP_PICKED",
      name: "Petőfi utca, Balatonszepezd",
      latitude: 46.820,
      longitude: 17.580,
    });

    assert.ok("fromCoordinates" in fields);
    assert.strictEqual(fields.fromName, "Petőfi utca, Balatonszepezd");
    assert.ok(!("from" in fields));
  });
});

// ─── Teljes folyamat: house_number_not_resolved → ACCEPT → routing ────────────

describe("Teljes folyamat: API válasz → ACCEPT → buildSearchRequestDestinationFields(MAP_PICKED)", () => {
  test("Lánc: processHouseNumberNotResolved → acceptStreetLevel → buildSearchRequestDestinationFields → toCoordinates", () => {
    // LÉPÉS 1: API válasz érkezik
    const pending = processHouseNumberNotResolved("to", bakonynanaStreet);
    assert.strictEqual(pending.pendingStreetLevelResubmit, false, "1. lépés: nincs auto-submit");

    // LÉPÉS 2: Felhasználó jóváhagyja
    const accepted = acceptStreetLevel(pending);
    assert.strictEqual(accepted.pendingStreetLevelResubmit, true, "2. lépés: submit trigger aktív");
    assert.strictEqual(accepted.mapPickedDestination.type, "MAP_PICKED");

    // LÉPÉS 3: Re-submit → request body összeállítása
    const requestFields = buildSearchRequestDestinationFields(
      accepted.mapPickedDestination
    );
    assert.ok("toCoordinates" in requestFields, "3. lépés: toCoordinates küldve");
    assert.ok(!("to" in requestFields), "3. lépés: nincs re-geokódolás");
    assert.deepStrictEqual(
      requestFields.toCoordinates,
      { latitude: bakonynanaStreet.lat, longitude: bakonynanaStreet.lon },
      "3. lépés: koordináta egyezik az API válasszal"
    );
  });

  test("Lánc: processHouseNumberNotResolved → modifyStreetLevel → MANUAL state → 'to' string", () => {
    // LÉPÉS 1: API válasz érkezik
    const pending = processHouseNumberNotResolved("to", bakonynanaStreet);
    assert.strictEqual(pending.pendingStreetLevelResubmit, false);

    // LÉPÉS 2: Felhasználó módosítja (dismiss)
    const dismissed = modifyStreetLevel();
    assert.strictEqual(dismissed.pendingStreetLevelResubmit, false, "2. lépés: nincs submit");

    // LÉPÉS 3: Felhasználó újra beküldi a változatlan MANUAL formot
    const requestFields = buildSearchRequestDestinationFields({
      type: "MANUAL",
      city: "Bakonynána",
      districtOrPostalCode: "8422",
      street: "Alkotmány utca 15",
    });
    assert.ok(!("toCoordinates" in requestFields), "3. lépés: nincs koordináta");
    assert.strictEqual(
      requestFields.to,
      "8422 Bakonynána, Alkotmány utca 15",
      "3. lépés: address string megy → szerver geocodeAddress()-t hív"
    );
  });
});
