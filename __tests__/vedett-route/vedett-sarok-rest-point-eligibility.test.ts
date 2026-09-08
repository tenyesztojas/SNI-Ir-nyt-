// Sprint E.1 hotfix (2026-09-08) — VédettSarok pihenőpont-alkalmassági
// szabály tesztjei.
//
//   node --test __tests__/vedett-route/vedett-sarok-rest-point-eligibility.test.ts
//
// STAGING BUG, amit ez a teszt lefed: egy coach/mentor szakember
// rekordja ("Novák Léna neuroaffirmatív tinicoach, ADHD-mentor") jelent
// meg pihenőpontként, mert a VédettSarok provider MINDEN "published",
// koordinátával rendelkező helyet automatikusan pihenőpontnak tekintett.
// A javítás: place.restPointEligible === true EXPLICIT kapu, SOHA nem
// kategórianév-alapú következtetés (lásd vedettSarokMapping.ts fejléce).

import { test } from "node:test";
import assert from "node:assert/strict";
import { placeToRestPointIfEligible } from "../../lib/vedett-route/restStopFlow/discovery/vedettSarokMapping.ts";
import type { Place } from "../../lib/types.ts";

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: "place-1",
    slug: "teszt-hely",
    name: "Teszt hely",
    category: "kavezo",
    city: "Budapest",
    address: "Teszt utca 1.",
    latitude: 47.498,
    longitude: 19.0405,
    description: "",
    whyFriendly: "",
    status: "published",
    restPointEligible: false,
    ...overrides,
  };
}

const ORIGIN = { lat: 47.4979, lon: 19.0402 };
const RADIUS_METERS = 800;

test("STAGING BUG regresszió: egy coach/mentor szakember rekordja (category='coach', restPointEligible hiányzik/false) NEM válik pihenőponttá, még akkor sem, ha van koordinátája és published", () => {
  const coach = makePlace({
    id: "coach-1",
    slug: "novak-lena-tinicoach",
    name: "Novák Léna neuroaffirmatív tinicoach, ADHD-mentor",
    category: "coach",
    status: "published",
    restPointEligible: false,
  });
  const result = placeToRestPointIfEligible(coach, ORIGIN, RADIUS_METERS);
  assert.equal(result, null, "egy nem explicit módon megjelölt hely SOHA nem válhat pihenőponttá, kategóriától függetlenül");
});

test("restPointEligible === true ÉS van koordináta ÉS a sugáron belül van -> valódi RestPoint-ot ad vissza, category mindig 'VEDETT_SAROK'", () => {
  const eligible = makePlace({
    id: "park-1",
    slug: "csendes-park",
    name: "Csendes Park",
    category: "park",
    restPointEligible: true,
  });
  const result = placeToRestPointIfEligible(eligible, ORIGIN, RADIUS_METERS);
  assert.ok(result, "explicit eligible hely esetén létre kell jönnie a RestPoint-nak");
  assert.equal(result!.source, "VEDETT_SAROK");
  assert.equal(result!.category, "VEDETT_SAROK");
  assert.equal(result!.id, "vedett-sarok:park-1");
  assert.equal(result!.name, "Csendes Park");
  // UNKNOWN != FALSE — a "places" séma nem tartalmaz ilyen mezőket,
  // ezért mindnek null-nak kell maradnia, SOHA nem false-nak.
  assert.equal(result!.toilet, null);
  assert.equal(result!.seating, null);
  assert.equal(result!.quietSpace, null);
});

test("category NEM befolyásolja a döntést — egy 'park' kategóriájú, de restPointEligible=false hely ugyanúgy kimarad, mint egy 'coach'", () => {
  const parkButNotEligible = makePlace({
    id: "park-2",
    category: "park",
    restPointEligible: false,
  });
  assert.equal(placeToRestPointIfEligible(parkButNotEligible, ORIGIN, RADIUS_METERS), null);
});

test("restPointEligible undefined-ként érkezik (migráció előtti/hiányzó DB oszlop) -> ugyanúgy kimarad, mint explicit false (UNKNOWN != ELIGIBLE)", () => {
  const place = makePlace({ restPointEligible: undefined as unknown as boolean });
  assert.equal(placeToRestPointIfEligible(place, ORIGIN, RADIUS_METERS), null);
});

test("koordináta nélküli hely (latitude/longitude undefined) kimarad, még akkor is, ha restPointEligible=true", () => {
  const place = makePlace({ restPointEligible: true, latitude: undefined, longitude: undefined });
  assert.equal(placeToRestPointIfEligible(place, ORIGIN, RADIUS_METERS), null);
});

test("eligible hely, de a sugáron KÍVÜL van -> kimarad", () => {
  const farAway = makePlace({
    restPointEligible: true,
    latitude: 47.6, // ~kb. 11+ km Budapest belvárosától
    longitude: 19.09,
  });
  const result = placeToRestPointIfEligible(farAway, ORIGIN, RADIUS_METERS);
  assert.equal(result, null);
});

test("eligible hely a sugáron BELÜL van -> nem marad ki (határeset-ellenőrzés a távolságszűrésre)", () => {
  const nearby = makePlace({
    restPointEligible: true,
    latitude: 47.499, // kb. 130-150 m Budapest belvárosától, 800 m-en belül
    longitude: 19.041,
  });
  const result = placeToRestPointIfEligible(nearby, ORIGIN, RADIUS_METERS);
  assert.ok(result, "a sugáron belüli eligible helynek meg kell jelennie");
});
