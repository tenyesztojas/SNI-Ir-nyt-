// lib/rest-points/schemas.ts tesztek — R. pont: "coordinate validation".
//   node --test __tests__/rest-points/schemas.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  restPointCreateSchema,
  restPointUpdateSchema,
  latitudeSchema,
  longitudeSchema,
} from "../../lib/rest-points/schemas.ts";

test("érvényes pihenőpont bemenet átmegy a validáción", () => {
  const result = restPointCreateSchema.safeParse({
    name: "Padok a téren",
    latitude: 47.4979,
    longitude: 19.0402,
    toilet: true,
    seating: true,
    quietSpace: false,
    indoors: false,
    outdoors: true,
    purchaseRequired: false,
    notes: "Csendes sarok, van pad.",
  });
  assert.equal(result.success, true);
});

test("érvényes bemenet opcionális mezők nélkül is átmegy", () => {
  const result = restPointCreateSchema.safeParse({
    name: "Pihenőpont",
    latitude: 0,
    longitude: 0,
  });
  assert.equal(result.success, true);
});

test("üres név elutasítva", () => {
  const result = restPointCreateSchema.safeParse({
    name: "   ",
    latitude: 47.5,
    longitude: 19.0,
  });
  assert.equal(result.success, false);
});

test("hiányzó név elutasítva", () => {
  const result = restPointCreateSchema.safeParse({
    latitude: 47.5,
    longitude: 19.0,
  });
  assert.equal(result.success, false);
});

test("túl hosszú név (>120 karakter) elutasítva", () => {
  const result = restPointCreateSchema.safeParse({
    name: "a".repeat(121),
    latitude: 47.5,
    longitude: 19.0,
  });
  assert.equal(result.success, false);
});

test("túl hosszú notes (>500 karakter) elutasítva", () => {
  const result = restPointCreateSchema.safeParse({
    name: "Pihenőpont",
    latitude: 47.5,
    longitude: 19.0,
    notes: "a".repeat(501),
  });
  assert.equal(result.success, false);
});

test("szélességi fok tartományon kívül (>90) elutasítva", () => {
  const result = latitudeSchema.safeParse(90.0001);
  assert.equal(result.success, false);
});

test("szélességi fok tartományon kívül (<-90) elutasítva", () => {
  const result = latitudeSchema.safeParse(-90.0001);
  assert.equal(result.success, false);
});

test("szélességi fok tartomány határa (90, -90) még érvényes", () => {
  assert.equal(latitudeSchema.safeParse(90).success, true);
  assert.equal(latitudeSchema.safeParse(-90).success, true);
});

test("hosszúsági fok tartományon kívül (>180) elutasítva", () => {
  const result = longitudeSchema.safeParse(180.0001);
  assert.equal(result.success, false);
});

test("hosszúsági fok tartományon kívül (<-180) elutasítva", () => {
  const result = longitudeSchema.safeParse(-180.0001);
  assert.equal(result.success, false);
});

test("hosszúsági fok tartomány határa (180, -180) még érvényes", () => {
  assert.equal(longitudeSchema.safeParse(180).success, true);
  assert.equal(longitudeSchema.safeParse(-180).success, true);
});

test("koordináta helyett szöveg (típushiba) elutasítva", () => {
  const result = restPointCreateSchema.safeParse({
    name: "Pihenőpont",
    latitude: "47.5",
    longitude: "19.0",
  });
  assert.equal(result.success, false);
});

test("update séma minden mezőt opcionálissá tesz (partial update)", () => {
  const result = restPointUpdateSchema.safeParse({ seating: true });
  assert.equal(result.success, true);
});

test("update séma is ellenőrzi a koordináta tartományt, ha meg van adva", () => {
  const result = restPointUpdateSchema.safeParse({ latitude: 999 });
  assert.equal(result.success, false);
});

test("üres update objektum érvényes (nincs kötelező mező update-nél)", () => {
  const result = restPointUpdateSchema.safeParse({});
  assert.equal(result.success, true);
});
