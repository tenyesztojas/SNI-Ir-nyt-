// NAVIGATION — MAGYAR TTS NORMALIZÁLÁS teszt (production hiba, 2026-10-01).
//
// A pure lib/vedett-route/navigation/hungarianSpeechNormalizer.ts modult
// teszteli (node --test, nincs jsdom/render, a projekt konvenciója szerint).
// A célzott tesztlista 1-4. pontjait fedi (a sprint-riport 5-6. pontját —
// a 0 méteres mozgási instrukció és a normál gyalogos instrukció — a
// __tests__/vedett-route/navigation-walk-progress.test.ts fedi, mert az a
// navigációs instrukció/state logika szintjén, NEM a TTS-normalizálásban
// dől el, lásd a hibajegy architekturális szabályát).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeHungarianTransitSpeech } from "../../lib/vedett-route/navigation/hungarianSpeechNormalizer.ts";

describe("1) járatszám + jármű — '7 busz' természetesen hangzik", () => {
  test("'7 busz' -> 'hetes busz' (a routeLabel() már a jármű-szóval bővített canonical szöveget adja)", () => {
    assert.equal(normalizeHungarianTransitSpeech("Szállj fel: 7 busz – Albertfalva vasútállomás felé"), "Szállj fel: hetes busz – Albertfalva vasútállomás felé");
  });
});

describe("2) betűjelzéses járat + jármű — '56A villamos' és 'M' megállónév-suffix", () => {
  test("'56A villamos' -> 'ötvenhatos A villamos'", () => {
    assert.equal(normalizeHungarianTransitSpeech("56A villamos"), "ötvenhatos A villamos");
  });

  test("teljes BOARD-szöveg: '56A villamos – Móricz Zsigmond körtér M felé' -> jármű ÉS a megállónév-végi M is helyesen hangzik", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Szállj fel: 56A villamos – Móricz Zsigmond körtér M felé"),
      "Szállj fel: ötvenhatos A villamos – Móricz Zsigmond körtér metróállomás felé"
    );
  });

  test("a bare 'M' megállónév-suffix csak megállónév/destination kontextusban cserélődik — mondatvégi írásjel előtt is", () => {
    assert.equal(normalizeHungarianTransitSpeech("Móricz Zsigmond körtér M."), "Móricz Zsigmond körtér metróállomás.");
    assert.equal(normalizeHungarianTransitSpeech("Móricz Zsigmond körtér M"), "Móricz Zsigmond körtér metróállomás");
  });

  test("a bare 'M' NEM globális csere — egy önálló, nem megállónév-végi 'M' szó más kontextusban nem alakul át", () => {
    // Nincs "felé" utána és nem a szöveg vége / mondatvég — ez a minta
    // SZÁNDÉKOSAN nem illeszkedik, lásd a hibajegy explicit tiltását.
    assert.equal(normalizeHungarianTransitSpeech("M méretű csomag érkezik"), "M méretű csomag érkezik");
  });

  test("a '140 m' távolság-rövidítés (kisbetűs 'm') SOSE keveredik a megállónév-végi nagy 'M'-mel", () => {
    assert.equal(normalizeHungarianTransitSpeech("140 m múlva fordulj jobbra"), "140 m múlva fordulj jobbra");
  });
});

describe("3) 'Örs vezér tere M+H' -> 'metró- és HÉV-állomás'", () => {
  test("bare bemenet (nincs 'felé' utána)", () => {
    assert.equal(normalizeHungarianTransitSpeech("Örs vezér tere M+H"), "Örs vezér tere metró- és HÉV-állomás");
  });

  test("'felé' utótaggal is helyesen hangzik", () => {
    assert.equal(normalizeHungarianTransitSpeech("Örs vezér tere M+H felé"), "Örs vezér tere metró- és HÉV-állomás felé");
  });
});

describe("4) M2 route identifier továbbra is természetesen működik (nem romlott el a meglévő szabály)", () => {
  test("'M2' -> 'em kettes metró'", () => {
    assert.equal(normalizeHungarianTransitSpeech("M2"), "em kettes metró");
  });

  test("'M2' mondat belsejében is változatlan", () => {
    assert.equal(normalizeHungarianTransitSpeech("Szállj át az M2-re"), "Szállj át az em kettes metró-re");
  });
});

describe("meglévő H/busz/villamos normalizálás változatlan", () => {
  test("H5 -> 'há ötös HÉV'", () => {
    assert.equal(normalizeHungarianTransitSpeech("H5"), "há ötös HÉV");
  });

  test("'Busz 80' -> 'nyolcvanas busz'", () => {
    assert.equal(normalizeHungarianTransitSpeech("Busz 80"), "nyolcvanas busz");
  });

  test("'4-6-os villamos' -> 'négyes-hatos villamos'", () => {
    assert.equal(normalizeHungarianTransitSpeech("4-6-os villamos"), "négyes-hatos villamos");
  });
});

describe("21-99 kéttagú sorszámnév (korlátozott szabály, nem általános számnév-motor)", () => {
  test("21 -> 'huszonegyes' (huszon-kötőhang, NEM 'húszegyes')", () => {
    assert.equal(normalizeHungarianTransitSpeech("21 busz"), "huszonegyes busz");
  });

  test("56 -> 'ötvenhatos'", () => {
    assert.equal(normalizeHungarianTransitSpeech("56 busz"), "ötvenhatos busz");
  });

  test("99 -> 'kilencvenkilences'", () => {
    assert.equal(normalizeHungarianTransitSpeech("99 busz"), "kilencvenkilences busz");
  });
});
