// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — pure,
// viselkedés-alapú tesztek transitGpsLossConfirmation.ts-re (nincs React/
// jsdom-függés, valódi input/output ellenőrzés, a projekt "prefer pure
// behavior tests over source regex tests" konvenciója szerint).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialTransitGpsLossConfirmationState,
  markTransitGpsLoss,
  resolveTransitGpsLossConfirmation,
  shouldAutoClearTransitGpsLossConfirmation,
  transitGpsLossQuestionText,
} from "../../lib/vedett-route/navigation/transitGpsLossConfirmation.ts";

describe("markTransitGpsLoss / resolveTransitGpsLossConfirmation", () => {
  test("kezdő állapotban nincs pending kérdés", () => {
    assert.deepEqual(createInitialTransitGpsLossConfirmationState(), { pending: false, transitMode: null });
  });

  test("egy LOST esemény transit közben pending-et jelöl, a transitMode-dal", () => {
    const next = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), "RAIL");
    assert.deepEqual(next, { pending: true, transitMode: "RAIL" });
  });

  test("egy MÁR pending állapotot egy újabb LOST esemény NEM ír felül (első bizonyíték marad mérvadó)", () => {
    const first = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), "BUS");
    const second = markTransitGpsLoss(first, "TRAM");
    assert.deepEqual(second, { pending: true, transitMode: "BUS" });
  });

  test("resolveTransitGpsLossConfirmation mindig a kezdő (nincs pending) állapotra áll vissza — IGEN/NEM/egyéb elévülés egyaránt ezt hívja", () => {
    const pending = markTransitGpsLoss(createInitialTransitGpsLossConfirmationState(), "SUBWAY");
    assert.deepEqual(resolveTransitGpsLossConfirmation(), createInitialTransitGpsLossConfirmationState());
    assert.notDeepEqual(pending, createInitialTransitGpsLossConfirmationState());
  });
});

describe("shouldAutoClearTransitGpsLossConfirmation — 'ha a GPS normálisan tér vissza, ne kérdezz semmit'", () => {
  test("nincs pending kérdés esetén sosem tisztít (nincs mit)", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation(false, true, false, "ON_ROUTE"), false);
  });

  test("pending, DE a GPS még nem usable (STALE/INVALID) — nem tisztít, várunk stabil fixre", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation(true, false, false, "ON_ROUTE"), false);
  });

  test("pending, DE még a reacquiring 'bemelegítési' ablakban vagyunk — nem tisztít", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation(true, true, true, "ON_ROUTE"), false);
  });

  test("pending, GPS stabil, DE MÉG megerősített OFF_ROUTE — nem tisztít (a kérdés releváns marad)", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation(true, true, false, "OFF_ROUTE"), false);
  });

  test("pending, GPS stabil, ÉS nincs (már/még) megerősített OFF_ROUTE — csendben tisztít, nincs kérdés", () => {
    assert.equal(shouldAutoClearTransitGpsLossConfirmation(true, true, false, "ON_ROUTE"), true);
    assert.equal(shouldAutoClearTransitGpsLossConfirmation(true, true, false, "POSSIBLY_OFF_ROUTE"), true);
  });
});

describe("transitGpsLossQuestionText — TRAIN/BUS/TRAM/SUBWAY megfelelő magyar kérdés", () => {
  test("RAIL és REGIONAL_RAIL egyaránt a vonatos kérdést adja", () => {
    assert.equal(transitGpsLossQuestionText("RAIL"), "Még mindig a vonaton vagy?");
    assert.equal(transitGpsLossQuestionText("REGIONAL_RAIL"), "Még mindig a vonaton vagy?");
  });

  test("BUS -> busz, TRAM -> villamos, SUBWAY -> metró", () => {
    assert.equal(transitGpsLossQuestionText("BUS"), "Még mindig a buszon vagy?");
    assert.equal(transitGpsLossQuestionText("TRAM"), "Még mindig a villamoson vagy?");
    assert.equal(transitGpsLossQuestionText("SUBWAY"), "Még mindig a metrón vagy?");
  });

  test("ismeretlen/hiányzó transitMode esetén semleges alapértelmezés, sosem crash", () => {
    assert.equal(transitGpsLossQuestionText(null), "Még mindig a járművön vagy?");
    assert.equal(transitGpsLossQuestionText("FERRY"), "Még mindig a járművön vagy?");
  });
});
