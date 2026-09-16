// VÉDETT ÚTVONAL — Navigation Instructions Sprint 1 (2026-09-16).
//
// Célzott teszt a lib/vedett-route/navigation/instructions.ts pure
// modulra (valódi függvényhívással, mock JourneyLeg adatokkal — a projekt
// meglévő mintáját követve, lásd pl. c41-ambiguous-and-origin-label.test.ts)
// ÉS forráskód-szintű (regex) ellenőrzéssel a VedettUtvonalSearchForm.tsx
// UI-bekötésre (a fájl mérete/React-függése miatt ott nem futtatjuk
// közvetlenül a komponenst).
//
//   node --test --experimental-strip-types __tests__/vedett-route/navigation-instructions.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNavigationInstructions,
  isAtRouteEnd,
  resolveActiveLegIndex,
  resolveLegPhaseFraction,
  selectActiveInstruction,
  type NavigationInstruction,
} from "../../lib/vedett-route/navigation/instructions.ts";
import { journeyLegsToNavigationRoute } from "../../lib/vedett-route/geometry.ts";
import type { JourneyLeg } from "../../lib/vedett-route/types.ts";

const SEARCH_FORM_PATH = join(import.meta.dirname, "..", "..", "components", "vedett-utvonal", "VedettUtvonalSearchForm.tsx");
const searchFormSrc = readFileSync(SEARCH_FORM_PATH, "utf-8");

function walkLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "WALK",
    fromName: "Induló pont",
    toName: "Deák Ferenc tér",
    durationMinutes: 5,
    realtime: false,
    ...overrides,
  };
}

function transitLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "TRANSIT",
    transitMode: "SUBWAY",
    routeShortName: "M2",
    fromName: "Deák Ferenc tér",
    toName: "Keleti pályaudvar",
    durationMinutes: 8,
    realtime: false,
    ...overrides,
  };
}

function rentalLeg(overrides: Partial<JourneyLeg> = {}): JourneyLeg {
  return {
    mode: "RENTAL",
    rentalProvider: "mol-bubi",
    fromName: "Bubi állomás A",
    toName: "Bubi állomás B",
    durationMinutes: 6,
    realtime: false,
    ...overrides,
  };
}

describe("buildNavigationInstructions — egyszerű gyalogos Journey", () => {
  test("1) egy WALK leg -> START, WALK, ARRIVE, ebben a sorrendben", () => {
    const legs = [walkLeg()];
    const instructions = buildNavigationInstructions({ legs });
    assert.deepEqual(instructions.map((i) => i.kind), ["START", "WALK", "ARRIVE"]);
    assert.equal(instructions[1].title, "Gyalogolj: Deák Ferenc tér");
    assert.equal(instructions[2].title, "Megérkeztél");
    assert.equal(instructions[2].detail, "Deák Ferenc tér");
  });

  test("WALK leg toName nélkül (defensive — a típus szerint kötelező mező, de a szöveg akkor is helyes marad, ha valamiért üres string jönne) -> generikus szöveg", () => {
    const legs = [walkLeg({ toName: "" })];
    const instructions = buildNavigationInstructions({ legs });
    const walk = instructions.find((i) => i.kind === "WALK");
    assert.equal(walk?.title, "Gyalogolj a következő pontig");
  });
});

describe("buildNavigationInstructions — tömegközlekedési leg -> BOARD/RIDE/ALIGHT", () => {
  test("2) egy TRANSIT leg -> BOARD (Szállj fel: M2, detail: honnan), RIDE (Utazz a M2 járattal), ALIGHT (Szállj le: Keleti pályaudvar)", () => {
    const legs = [transitLeg()];
    const instructions = buildNavigationInstructions({ legs });
    const [start, board, ride, alight, arrive] = instructions;
    assert.equal(start.kind, "START");
    assert.equal(board.kind, "BOARD");
    assert.equal(board.title, "Szállj fel: M2");
    assert.equal(board.detail, "Deák Ferenc tér");
    assert.equal(ride.kind, "RIDE");
    assert.equal(ride.title, "Utazz a M2 járattal");
    assert.equal(alight.kind, "ALIGHT");
    assert.equal(alight.title, "Szállj le: Keleti pályaudvar");
    assert.equal(arrive.kind, "ARRIVE");
  });

  test("megbízható megállószám (intermediateStops) esetén a RIDE detail 'N megálló', hiányában nincs kitalálva", () => {
    const withStops = buildNavigationInstructions({
      legs: [transitLeg({ intermediateStops: [{ name: "A" }, { name: "B" }, { name: "C" }] })],
    });
    const ride = withStops.find((i) => i.kind === "RIDE");
    assert.equal(ride?.detail, "3 megálló");

    const withoutStops = buildNavigationInstructions({ legs: [transitLeg()] });
    const rideNoStops = withoutStops.find((i) => i.kind === "RIDE");
    assert.equal(rideNoStops?.detail, undefined, "nincs intermediateStops adat -> NEM becsülünk megállószámot");

    const zeroStops = buildNavigationInstructions({ legs: [transitLeg({ intermediateStops: [] })] });
    const rideZeroStops = zeroStops.find((i) => i.kind === "RIDE");
    assert.equal(rideZeroStops?.detail, undefined, "0 hosszú intermediateStops -> a '0 megálló' szöveg félrevezető lenne, elhagyjuk");
  });

  test("routeShortName hiányában routeLongName, majd generikus 'járat' fallback — SOSEM kitalált vonalnév", () => {
    const longNameOnly = buildNavigationInstructions({
      legs: [transitLeg({ routeShortName: undefined, routeLongName: "2-es metró" })],
    });
    assert.equal(longNameOnly.find((i) => i.kind === "BOARD")?.title, "Szállj fel: 2-es metró");

    const neitherName = buildNavigationInstructions({
      legs: [transitLeg({ routeShortName: undefined, routeLongName: undefined })],
    });
    assert.equal(neitherName.find((i) => i.kind === "BOARD")?.title, "Szállj fel: járat");
  });
});

describe("buildNavigationInstructions — több leg, sorrend és TRANSFER", () => {
  test("3) WALK -> TRANSIT -> WALK sorrend helyesen épül fel, ARRIVE mindig a végén", () => {
    const legs = [
      walkLeg({ toName: "Deák Ferenc tér" }),
      transitLeg({ fromName: "Deák Ferenc tér", toName: "Keleti pályaudvar" }),
      walkLeg({ fromName: "Keleti pályaudvar", toName: "Cél" }),
    ];
    const instructions = buildNavigationInstructions({ legs });
    assert.deepEqual(instructions.map((i) => i.kind), ["START", "WALK", "BOARD", "RIDE", "ALIGHT", "WALK", "ARRIVE"]);
    assert.equal(instructions[instructions.length - 1].kind, "ARRIVE");
  });

  test("4) ARRIVE MINDIG a lista utolsó eleme, függetlenül a legek számától/típusától", () => {
    const single = buildNavigationInstructions({ legs: [walkLeg()] });
    assert.equal(single[single.length - 1].kind, "ARRIVE");

    const multi = buildNavigationInstructions({ legs: [walkLeg(), transitLeg(), rentalLeg(), walkLeg()] });
    assert.equal(multi[multi.length - 1].kind, "ARRIVE");
  });

  test("két egymást követő TRANSIT leg (átszállás, gyaloglás nélkül) -> a második leg TRANSFER-t ad BOARD helyett, az első leg ALIGHT-ját elhagyjuk (egy fő teendő, nincs duplikált 'szállj le'+'szállj át')", () => {
    const legs = [
      transitLeg({ routeShortName: "M2", fromName: "Deák Ferenc tér", toName: "Astoria" }),
      transitLeg({ routeShortName: "M3", fromName: "Astoria", toName: "Nyugati" }),
    ];
    const instructions = buildNavigationInstructions({ legs });
    assert.deepEqual(instructions.map((i) => i.kind), ["START", "BOARD", "RIDE", "TRANSFER", "RIDE", "ALIGHT", "ARRIVE"]);
    const transfer = instructions.find((i) => i.kind === "TRANSFER");
    assert.equal(transfer?.title, "Szállj át a következő járatra");
    assert.equal(transfer?.detail, "Következő járat: M3");
  });

  test("Bubi/kerékpár leg csak akkor kap BIKE_* eseményt, ha a mode RENTAL — normál WALK/TRANSIT legek sosem", () => {
    const instructions = buildNavigationInstructions({ legs: [rentalLeg()] });
    assert.deepEqual(instructions.map((i) => i.kind), ["START", "BIKE_PICKUP", "BIKE_RIDE", "BIKE_DROPOFF", "ARRIVE"]);
    assert.equal(instructions[1].title, "Vedd ki a kerékpárt: Bubi állomás A");
    assert.equal(instructions[3].title, "Tedd le a kerékpárt: Bubi állomás B");
  });
});

describe("buildNavigationInstructions — determinizmus és hiányzó opcionális adatok", () => {
  test("5) hiányzó opcionális mezők esetén nincs kitalált információ (pl. delayMinutes/scheduledDepartureTime sosem jelenik meg egy instrukció title/detail mezőjében)", () => {
    const legs = [transitLeg({ delayMinutes: undefined, scheduledDepartureTime: undefined })];
    const instructions = buildNavigationInstructions({ legs });
    for (const instr of instructions) {
      assert.doesNotMatch(instr.title, /delay|késés|perc késés/i);
      if (instr.detail) assert.doesNotMatch(instr.detail, /delay|késés/i);
    }
  });

  test("6) UGYANAZ a Journey (tartalom szerint azonos legs) MINDIG UGYANAZT az instrukció-listát adja (determinizmus, nincs Date.now()/Math.random())", () => {
    const legs = [walkLeg(), transitLeg(), walkLeg({ fromName: "Keleti pályaudvar", toName: "Cél" })];
    const first = buildNavigationInstructions({ legs });
    const second = buildNavigationInstructions({ legs: [walkLeg(), transitLeg(), walkLeg({ fromName: "Keleti pályaudvar", toName: "Cél" })] });
    assert.deepEqual(first, second);
  });

  test("7) REROUTE KOMPATIBILITÁS — új Journey (más legs) -> új instrukció lista, a régi Journey instrukciói nem szennyezik be", () => {
    const originalInstructions = buildNavigationInstructions({ legs: [walkLeg({ toName: "Régi cél" })] });
    const rerouted = buildNavigationInstructions({ legs: [walkLeg({ toName: "Új cél (reroute után)" })] });
    assert.notDeepEqual(originalInstructions, rerouted);
    assert.equal(rerouted.find((i) => i.kind === "ARRIVE")?.detail, "Új cél (reroute után)");
  });

  test("üres legs tömb esetén üres instrukció-lista (nincs START/ARRIVE kitalálva egy nem létező útvonalhoz)", () => {
    assert.deepEqual(buildNavigationInstructions({ legs: [] }), []);
  });
});

describe("selectActiveInstruction — current/next pár, dokumentált korlátozással", () => {
  test("legIndex nélkül az ELSŐ instrukció az aktív (stabil alapállapot, NEM heurisztika) — a MÁSODIK a 'next'", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), transitLeg()] });
    const active = selectActiveInstruction(instructions);
    assert.equal(active.current, instructions[0]);
    assert.equal(active.next, instructions[1]);
  });

  test("explicit legIndex esetén az ADOTT leghez tartozó ELSŐ instrukció az aktív", () => {
    const instructions = buildNavigationInstructions({ legs: [walkLeg(), transitLeg()] });
    const active = selectActiveInstruction(instructions, { legIndex: 1 });
    const expectedIndex = instructions.findIndex((i) => i.legIndex === 1);
    assert.equal(active.current, instructions[expectedIndex]);
    assert.equal(active.next, instructions[expectedIndex + 1] ?? null);
  });

  test("üres instrukció-lista esetén current és next is null (sosem dob kivételt)", () => {
    assert.deepEqual(selectActiveInstruction([]), { current: null, next: null });
  });

  test("az utolsó instrukciónál (ARRIVE) a 'next' null", () => {
    const instructions: NavigationInstruction[] = [{ id: "arrive", kind: "ARRIVE", title: "Megérkeztél", legIndex: 0 }];
    const active = selectActiveInstruction(instructions);
    assert.equal(active.current, instructions[0]);
    assert.equal(active.next, null);
  });
});

// ============================================================================
// NAVIGATION INSTRUCTIONS SPRINT 2 (2026-09-16) — matchedSegmentIndex ->
// legIndex -> leg-en belüli fázis. Egyszerű, EGY-egy szegmenses (fromLat/
// fromLon -> toLat/toLon egyenes vonal fallback, nincs geometryEncoded)
// legekből álló, összefüggő 3 lábú Journey — a lábak EGYMÁS VÉGPONTJÁBAN
// érnek össze, hogy a megosztott-határpont dedup-logikát is lefedjék.
// ============================================================================
const THREE_LEG_JOURNEY: JourneyLeg[] = [
  walkLeg({ fromLat: 47.0, fromLon: 19.0, toLat: 47.0, toLon: 19.001 }),
  transitLeg({ fromLat: 47.0, fromLon: 19.001, toLat: 47.0, toLon: 19.002 }),
  walkLeg({ fromName: "Keleti pályaudvar", toName: "Cél", fromLat: 47.0, fromLon: 19.002, toLat: 47.0, toLon: 19.003 }),
];

describe("journeyLegsToNavigationRoute + resolveActiveLegIndex/isAtRouteEnd — matchedSegmentIndex -> legIndex", () => {
  test("1) matched segment -> első leg", () => {
    const { legRanges } = journeyLegsToNavigationRoute(THREE_LEG_JOURNEY);
    assert.equal(legRanges.length, 3, "mindhárom leg pontosan 1 saját szegmenst ad (a megosztott végpontok deduplikáltak)");
    assert.equal(resolveActiveLegIndex(0, legRanges), 0);
  });

  test("2) matched segment -> középső leg", () => {
    const { legRanges } = journeyLegsToNavigationRoute(THREE_LEG_JOURNEY);
    assert.equal(resolveActiveLegIndex(1, legRanges), 1);
  });

  test("3) pontos leg-boundary — a tartományok folytonosak, átfedés/lyuk nélkül", () => {
    const { legRanges } = journeyLegsToNavigationRoute(THREE_LEG_JOURNEY);
    assert.equal(legRanges[0].endSegmentIndex + 1, legRanges[1].startSegmentIndex);
    assert.equal(legRanges[1].endSegmentIndex + 1, legRanges[2].startSegmentIndex);
    assert.equal(resolveActiveLegIndex(legRanges[0].endSegmentIndex, legRanges), 0);
    assert.equal(resolveActiveLegIndex(legRanges[1].startSegmentIndex, legRanges), 1);
  });

  test("4) utolsó leg + route-end állapot", () => {
    const { coordinates, legRanges } = journeyLegsToNavigationRoute(THREE_LEG_JOURNEY);
    const lastSegmentIndex = legRanges[legRanges.length - 1].endSegmentIndex;
    assert.equal(resolveActiveLegIndex(lastSegmentIndex, legRanges), 2);
    assert.equal(isAtRouteEnd(lastSegmentIndex, coordinates.length), true);
    assert.equal(isAtRouteEnd(legRanges[0].startSegmentIndex, coordinates.length), false);
  });

  test("5) invalid/hiányzó/tartományon kívüli segment index -> null, sosem dob kivételt", () => {
    const { legRanges } = journeyLegsToNavigationRoute(THREE_LEG_JOURNEY);
    assert.equal(resolveActiveLegIndex(null, legRanges), null);
    assert.equal(resolveActiveLegIndex(-1, legRanges), null);
    assert.equal(resolveActiveLegIndex(999, legRanges), null);
    assert.equal(resolveActiveLegIndex(0, []), null);
    assert.equal(isAtRouteEnd(null, 4), false);
  });

  test("üres legs tömb -> üres coordinates/legRanges, resolveLegPhaseFraction degenerált range esetén 0-t ad (konzervatív fallback)", () => {
    const { coordinates, legRanges } = journeyLegsToNavigationRoute([]);
    assert.deepEqual(coordinates, []);
    assert.deepEqual(legRanges, []);
    assert.equal(resolveLegPhaseFraction(5, null), 0);
    assert.equal(resolveLegPhaseFraction(5, { legIndex: 0, startSegmentIndex: 3, endSegmentIndex: 2 }), 0);
  });

  test("12) reroute — új Journey (más geometria) -> új legRanges, a régi geometria nem szennyez", () => {
    const before = journeyLegsToNavigationRoute(THREE_LEG_JOURNEY);
    const rerouted = journeyLegsToNavigationRoute([walkLeg({ fromLat: 47.1, fromLon: 19.1, toLat: 47.1, toLon: 19.101 })]);
    assert.notDeepEqual(before.legRanges, rerouted.legRanges);
    assert.equal(rerouted.legRanges.length, 1);
  });
});

describe("selectActiveInstruction — fázis-alapú current/next (Sprint 2)", () => {
  test("6) WALK leg esetén a leg saját (egyetlen) WALK instrukciója marad current, a fázistól függetlenül", () => {
    const instructions = buildNavigationInstructions({ legs: THREE_LEG_JOURNEY });
    const active = selectActiveInstruction(instructions, { legIndex: 0, legPhaseFraction: 0.5 });
    assert.equal(active.current?.kind, "WALK");
    assert.equal(active.current?.legIndex, 0);
  });

  test("7) TRANSIT leg -> BOARD (fázis eleje) -> RIDE (közepe) -> ALIGHT (vége) előrehaladás", () => {
    const instructions = buildNavigationInstructions({ legs: THREE_LEG_JOURNEY });
    assert.equal(selectActiveInstruction(instructions, { legIndex: 1, legPhaseFraction: 0 }).current?.kind, "BOARD");
    assert.equal(selectActiveInstruction(instructions, { legIndex: 1, legPhaseFraction: 0.5 }).current?.kind, "RIDE");
    assert.equal(selectActiveInstruction(instructions, { legIndex: 1, legPhaseFraction: 0.9 }).current?.kind, "ALIGHT");
  });

  test("8) több transit leg (átszállással) között helyes váltás — a második leg TRANSFER-t ad, nem BOARD-ot", () => {
    const legs = [
      transitLeg({ routeShortName: "M2", fromName: "Deák Ferenc tér", toName: "Astoria" }),
      transitLeg({ routeShortName: "M3", fromName: "Astoria", toName: "Nyugati" }),
    ];
    const instructions = buildNavigationInstructions({ legs });
    assert.equal(selectActiveInstruction(instructions, { legIndex: 0, legPhaseFraction: 0.1 }).current?.kind, "BOARD");
    assert.equal(selectActiveInstruction(instructions, { legIndex: 1, legPhaseFraction: 0 }).current?.kind, "TRANSFER");
  });

  test("9) Bubi pickup -> ride -> dropoff a legPhaseFraction alapján", () => {
    const instructions = buildNavigationInstructions({ legs: [rentalLeg()] });
    assert.equal(selectActiveInstruction(instructions, { legIndex: 0, legPhaseFraction: 0 }).current?.kind, "BIKE_PICKUP");
    assert.equal(selectActiveInstruction(instructions, { legIndex: 0, legPhaseFraction: 0.5 }).current?.kind, "BIKE_RIDE");
    assert.equal(selectActiveInstruction(instructions, { legIndex: 0, legPhaseFraction: 0.9 }).current?.kind, "BIKE_DROPOFF");
  });

  test("10) ARRIVE KIZÁRÓLAG atRouteEnd=true esetén aktív — a leg saját instrukciója marad, amíg a route-end nem tényleges", () => {
    const instructions = buildNavigationInstructions({ legs: THREE_LEG_JOURNEY });
    const notEnd = selectActiveInstruction(instructions, { legIndex: 2, legPhaseFraction: 0.99, atRouteEnd: false });
    assert.notEqual(notEnd.current?.kind, "ARRIVE");
    const atEnd = selectActiveInstruction(instructions, { legIndex: 2, legPhaseFraction: 0.99, atRouteEnd: true });
    assert.equal(atEnd.current?.kind, "ARRIVE");
  });

  test("11) current és next SOSEM azonos instrukció, semelyik leg/fázis kombinációnál", () => {
    const instructions = buildNavigationInstructions({ legs: THREE_LEG_JOURNEY });
    for (let legIndex = 0; legIndex < 3; legIndex += 1) {
      for (const fraction of [0, 0.3, 0.6, 0.9]) {
        const active = selectActiveInstruction(instructions, { legIndex, legPhaseFraction: fraction });
        if (active.current && active.next) assert.notEqual(active.current.id, active.next.id);
      }
    }
  });
});

describe("UI-bekötés (VedettUtvonalSearchForm.tsx) — forráskód-szintű ellenőrzés", () => {
  test("8) az instrukció-kártya CSAK navigationMode === true esetén jelenhet meg (és van értelmes aktuális instrukció)", () => {
    assert.match(searchFormSrc, /import\s*\{[\s\S]{0,220}buildNavigationInstructions[\s\S]{0,220}\}\s*from\s*"@\/lib\/vedett-route\/navigation\/instructions"/);
    assert.match(searchFormSrc, /import\s*\{[\s\S]{0,220}selectActiveInstruction[\s\S]{0,220}\}\s*from\s*"@\/lib\/vedett-route\/navigation\/instructions"/);
    assert.match(searchFormSrc, /navigationMode && navigationInstructionForDisplay &&/);
  });

  test("13. REROUTING KOMPATIBILITÁS — a kártya az automatikus reroute folyamata alatt is elrejtve marad (nincs elavult instrukció a régi útvonalról)", () => {
    assert.match(searchFormSrc, /navigationInstructionForDisplay = \(restStopMapState\.active && restStopMapState\.legsOverride\) \|\| automaticRerouteStatus === "REROUTING"/);
  });

  test("6. AUTOMATIKUS REROUTE KOMPATIBILITÁS — az instrukciók useMemo-val a displayedJourney.legs-ből származnak (nincs külön, szinkronizálandó instruction state)", () => {
    assert.match(searchFormSrc, /const navigationInstructions = useMemo\(\s*\n\s*\(\) => buildNavigationInstructions\(\{ legs: displayedJourney\.legs \}\),\s*\n\s*\[displayedJourney\.legs\]\s*\n\s*\);/);
    assert.doesNotMatch(searchFormSrc, /useState<NavigationInstruction/, "NE legyen külön React state az instrukciókhoz — pure derivation elegendő");
  });

  test("7. REST STOP KOMPATIBILITÁS — a kártya rest-stop legsOverride aktív ideje alatt NEM jelenik meg (a JourneyLegForGeometry típusnak nincs fromName/toName/routeShortName mezője, amiből a szöveg megbízhatóan felépülne — dokumentált korlátozás, nincs kitalálva)", () => {
    assert.match(searchFormSrc, /restStopMapState\.active && restStopMapState\.legsOverride[\s\S]{0,120}\? null/);
  });

  test("9) current + next vizuális hierarchia jelen van a JSX-ben (a 'next' kisebb/másodlagos, 'Következő' felirattal)", () => {
    assert.match(searchFormSrc, /navigationInstructionForDisplay\.title/);
    assert.match(searchFormSrc, /activeNavigationInstruction\.next && \(/);
    assert.match(searchFormSrc, /Következő/);
  });

  test("10) a MEGLÉVŐ ETA/hátralévő távolság kártya és a pihenőpont-kontrollok kódja NEM távolítódott el", () => {
    assert.match(searchFormSrc, /Várható érkezés/);
    assert.match(searchFormSrc, /RestPointQuickAdd/);
    assert.match(searchFormSrc, /RestStopFlowPanel/);
  });

  test("az instrukció-kártya szövegei kerülik a sürgető/riasztó megfogalmazást (autizmusbarát UX)", () => {
    // Csak az ÚJ instrukció-kártya JSX-blokkját vizsgáljuk (navigationMode &&
    // navigationInstructionForDisplay &&  ...  a kártya záró div-jéig), NEM a
    // teljes fájlt — a fájl más, ettől a sprinttől független részei (pl. a
    // GPS-lifecycle kommentek "AZONNAL le kell állítani") jogosan
    // tartalmazhatják ezeket a szavakat semleges, nem felhasználó-néző
    // szövegkörnyezetben (kódkommentben), ami NEM autizmusbarát UX-sérelem.
    const cardMatch = searchFormSrc.match(/navigationMode && navigationInstructionForDisplay &&[\s\S]*?\n {12}\)\}/);
    assert.ok(cardMatch, "megtalálható az instrukció-kártya JSX-blokkja");
    assert.doesNotMatch(cardMatch[0], /SIESS|AZONNAL|ELRONTOTTAD/);
  });
});
