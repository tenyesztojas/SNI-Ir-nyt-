import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeHungarianTransitSpeech } from "../../lib/vedett-route/navigation/hungarianSpeechNormalizer.ts";

describe("Hungarian transit TTS normalizer", () => {
  test("metro route identifiers are spoken naturally", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Szállj fel: M2"),
      "Szállj fel: em kettes metró"
    );

    assert.equal(
      normalizeHungarianTransitSpeech("Szállj fel: M4"),
      "Szállj fel: em négyes metró"
    );
  });

  test("combined metro and HÉV stop marker is expanded", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Örs vezér tere M+H felé"),
      "Örs vezér tere metró és HÉV felé"
    );
  });

  test("HÉV route identifier is spoken naturally", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("H5"),
      "há ötös HÉV"
    );
  });

  test("bus route number is spoken as a Hungarian route number", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Busz 80"),
      "nyolcvanas busz"
    );

    assert.equal(
      normalizeHungarianTransitSpeech("7 busz"),
      "hetes busz"
    );
  });

  test("4-6 tram is spoken naturally", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("4-6-os villamos"),
      "négyes-hatos villamos"
    );
  });

  test("ordinary navigation text remains unchanged", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Fordulj jobbra a Bartók Béla útra"),
      "Fordulj jobbra a Bartók Béla útra"
    );
  });

  test("real Örs vezér tere example is normalized", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Busz 80. Örs vezér tere M+H felé"),
      "nyolcvanas busz. Örs vezér tere metró és HÉV felé"
    );
  });
});
