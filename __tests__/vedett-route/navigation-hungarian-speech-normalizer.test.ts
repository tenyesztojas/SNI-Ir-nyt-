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

  // PRODUCTION HOTFIX (2026-10-01) — a megállónév-végi "M+H" jelzés mostantól
  // "metró- és HÉV-állomás"-ra alakul (lásd hungarianSpeechNormalizer.ts
  // fejlécét), NEM a korábbi "metró és HÉV"-re — a korábbi szöveg maga volt
  // a bejelentett production hiba egyik tünete (hiányzó "-állomás" utótag).
  test("combined metro and HÉV stop marker is expanded", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Örs vezér tere M+H felé"),
      "Örs vezér tere metró- és HÉV-állomás felé"
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

  // PRODUCTION HOTFIX (2026-10-01) — lásd a fenti "combined metro and HÉV"
  // tesztet: az elvárt kimenet a javított "metró- és HÉV-állomás" szöveget
  // tartalmazza.
  test("real Örs vezér tere example is normalized", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Busz 80. Örs vezér tere M+H felé"),
      "nyolcvanas busz. Örs vezér tere metró- és HÉV-állomás felé"
    );
  });
});

// NAVIGATION — MAGYAR TTS NORMALIZÁLÁS, PRODUCTION HOTFIX (2026-10-01).
//
// A fenti, MEGLÉVŐ leíró blokk a modul korábbi viselkedését fedi (a "M+H"
// két érintett assertion-je frissítve a javított szövegre, lásd ott). Az
// alábbi blokkok a hibajegy 1-4. tesztlista-pontjait fedik: betűjelzéses
// járat + jármű (56A villamos), megállónév-végi bare "M" kontextus-függő
// cseréje, és a 21-99 kéttagú sorszámnév-szabály.

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

// REGRESSZIÓ (2026-10-01) — az instructions.ts routeLabel() a canonical
// szövegben MOST már a transitMode-ból levezetett jármű-szót is kiírja
// (pl. "M2 metró", "H5 vonat" — lásd transitVehicleNoun()). A normalizáló
// M[1-4]/H(\d+) szabálya ezt nem ismerte, ezért duplikálta a jármű-szót.
describe("REGRESSZIÓ — a canonical szöveg jármű-szava NEM duplikálódik", () => {
  test("'M2 metró' -> 'em kettes metró' (SOHA nem 'em kettes metró metró')", () => {
    assert.equal(normalizeHungarianTransitSpeech("M2 metró"), "em kettes metró");
  });

  test("'M4 metró' -> 'em négyes metró'", () => {
    assert.equal(normalizeHungarianTransitSpeech("M4 metró"), "em négyes metró");
  });

  // H5 (HÉV-vonal) transitMode-ja a production kódban REGIONAL_RAIL/RAIL,
  // tehát transitVehicleNoun() "vonat"-ot ad — a canonical szöveg "H5 vonat".
  test("'H5 vonat' -> 'há ötös HÉV' (SOHA nem 'há ötös HÉV vonat')", () => {
    assert.equal(normalizeHungarianTransitSpeech("H5 vonat"), "há ötös HÉV");
  });

  test("'H5 HÉV' -> 'há ötös HÉV' (SOHA nem 'há ötös HÉV HÉV')", () => {
    assert.equal(normalizeHungarianTransitSpeech("H5 HÉV"), "há ötös HÉV");
  });

  test("a jármű-szó nélküli 'M2'/'H5' bemenet változatlanul működik (nincs regresszió a meglévő esetre)", () => {
    assert.equal(normalizeHungarianTransitSpeech("M2"), "em kettes metró");
    assert.equal(normalizeHungarianTransitSpeech("H5"), "há ötös HÉV");
  });

  test("teljes BOARD-szöveg jármű-szóval: 'Szállj fel: M2 metró – Örs vezér tere felé'", () => {
    assert.equal(
      normalizeHungarianTransitSpeech("Szállj fel: M2 metró – Örs vezér tere felé"),
      "Szállj fel: em kettes metró – Örs vezér tere felé"
    );
  });
});
