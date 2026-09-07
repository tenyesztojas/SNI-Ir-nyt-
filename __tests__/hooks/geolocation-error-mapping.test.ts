// lib/hooks/useGeolocation.ts — mapError() tesztek.
// I. pont: "GPS failure" — engedély megtagadva / nem elérhető / timeout
// fallback-ek helyes állapot-leképezése. Tisztán a mapError() logikai
// függvényt teszteli, böngésző/DOM nélkül (node --test futtatható).
//
//   node --test __tests__/hooks/geolocation-error-mapping.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapError } from "../../lib/hooks/useGeolocation.ts";

// A böngésző GeolocationPositionError nem konstruálható közvetlenül
// tesztkörnyezetben, ezért egy minimál, a valós interfésznek megfelelő
// mock objektumot építünk (code + a három konstans mező).
function makeError(code: 1 | 2 | 3): GeolocationPositionError {
  return {
    code,
    message: "mock",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

test("PERMISSION_DENIED (1) -> status: 'denied'", () => {
  const result = mapError(makeError(1));
  assert.equal(result.status, "denied");
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.ok(result.errorMessage && result.errorMessage.length > 0);
});

test("TIMEOUT (3) -> status: 'timeout'", () => {
  const result = mapError(makeError(3));
  assert.equal(result.status, "timeout");
  assert.ok(result.errorMessage && result.errorMessage.length > 0);
});

test("POSITION_UNAVAILABLE (2) -> status: 'unavailable' (pl. asztali gép GPS nélkül)", () => {
  const result = mapError(makeError(2));
  assert.equal(result.status, "unavailable");
  assert.ok(result.errorMessage && result.errorMessage.length > 0);
});

test("ismeretlen/egyéb hibakód -> biztonságosan 'unavailable'-re esik vissza, nem dob kivételt", () => {
  const result = mapError(makeError(99 as 1 | 2 | 3));
  assert.equal(result.status, "unavailable");
});

test("hiba esetén a koordináták mindig null-ra állnak (nincs 'félig érvényes' pozíció)", () => {
  for (const code of [1, 2, 3] as const) {
    const result = mapError(makeError(code));
    assert.equal(result.latitude, null);
    assert.equal(result.longitude, null);
    assert.equal(result.accuracyMeters, null);
  }
});
