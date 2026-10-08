// VÉDETT ÚTVONAL — Live Alternative ajánlat-részletek (csak megjelenítés)
//   node --test __tests__/vedett-route/live-alternative-offer-details.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Journey, JourneyLeg } from "../../lib/vedett-route/types.ts";
import {
  buildLiveAlternativeOfferDetails,
  formatClockTime,
  LONGER_WALKING_NOTICE,
} from "../../components/vedett-utvonal/liveAlternativeOfferDetails.ts";

const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const block = (marker: string) => {
  const i = form.indexOf(marker);
  assert.ok(i >= 0, marker);
  return form.slice(i, form.indexOf("</div>\n            )}", i));
};

const NOW = Date.parse("2026-10-08T10:00:00Z");
const iso = (m: number) => new Date(NOW + m * 60_000).toISOString();
const walk = (m: number) => ({ mode: "WALK", fromName: "x", toName: "y", durationMinutes: m, realtime: false }) as JourneyLeg;
const transit = (id: string, d: number, a: number, extra: Partial<JourneyLeg> = {}) =>
  ({ mode: "TRANSIT", fromName: "a", toName: "b", tripId: id, departureTime: iso(d), arrivalTime: iso(a), durationMinutes: a - d, realtime: false, ...extra }) as JourneyLeg;
const journey = (legs: JourneyLeg[], extra: Partial<Journey> = {}) =>
  ({ legs, departureTime: iso(0), arrivalTime: iso(60), totalDurationMinutes: 60, transfers: 0, walkingMinutes: 0, ...extra }) as unknown as Journey;

// Eredeti: 4' séta → T1 (5..20) → 3' séta → T2 (26..40) → 5' séta  ⇒ érkezés 45, hátralévő gyaloglás 12'
const current = () => journey([walk(4), transit("T1", 5, 20), walk(3), transit("T2", 26, 40), walk(5)]);
// Jelölt: 10' séta → C1 (12..30) → 8' séta ⇒ érkezés 38, gyaloglás 18'
const candidate = (extra: Partial<Journey> = {}) =>
  journey([walk(10), transit("C1", 12, 30), walk(8)], { arrivalTime: iso(38), totalDurationMinutes: 38, transfers: 0, ...extra });
const details = (triggerType: Parameters<typeof buildLiveAlternativeOfferDetails>[0]["triggerType"], cand = candidate(), cur = current()) =>
  buildLiveAlternativeOfferDetails({ triggerType, candidate: cand, current: cur, currentActiveLegIndex: 0, nowMs: NOW });

describe("ok", () => {
  test("1) járatkimaradás oka", () => {
    assert.equal(details("CANCELLED").reasonLabel, "Ok: járatkimaradás");
  });
  test("2) késés és elveszett csatlakozás megkülönböztetve; bizonytalan oknál nincs ok-sor", () => {
    assert.equal(details("SIGNIFICANT_REALTIME_DEGRADATION").reasonLabel, "Ok: jelentős késés");
    assert.equal(details("MISSED_CONNECTION").reasonLabel, "Ok: elveszett csatlakozás");
    assert.equal(details("MANUAL_CHECK").reasonLabel, null);
    assert.equal(details(null).reasonLabel, null);
  });
});

describe("érkezés, menetidő, átszállás, gyaloglás", () => {
  test("3) érkezési idő a jelölt SAJÁT érkezéséből, a meglévő formázással", () => {
    const d = details("SIGNIFICANT_REALTIME_DEGRADATION");
    assert.equal(d.arrivalLabel, formatClockTime(Date.parse(iso(38))));
    assert.notEqual(d.arrivalLabel, formatClockTime(Date.parse(iso(45))), "nem az eredeti érkezése");
  });
  test("4) hiányzó / érvénytelen érkezési adat → nincs érkezés és nincs időkülönbség", () => {
    for (const arrivalTime of [undefined, "", "nem-dátum"]) {
      const d = details("SIGNIFICANT_REALTIME_DEGRADATION", candidate({ arrivalTime } as Partial<Journey>));
      assert.equal(d.arrivalLabel, null);
      assert.equal(d.arrivalDifferenceLabel, null);
    }
  });
  test("5) menetidő, átszállás és gyaloglás; érvénytelen értéknél nincs kitalált szám", () => {
    const d = details("CANCELLED", candidate({ totalDurationMinutes: 37.6, transfers: 1 }));
    assert.equal(d.durationMinutes, 38);
    assert.equal(d.transfers, 1);
    assert.equal(d.walkingMinutes, 18);
    const bad = details("CANCELLED", candidate({ totalDurationMinutes: Number.NaN, transfers: -1 } as Partial<Journey>));
    assert.equal(bad.durationMinutes, null);
    assert.equal(bad.transfers, null);
  });
  test("6) gyaloglási többlet az eredeti hátralévő gyalogláshoz képest + semleges figyelmeztetés", () => {
    const d = details("SIGNIFICANT_REALTIME_DEGRADATION");
    assert.equal(d.extraWalkingMinutes, 6); // 18 − 12
    assert.equal(d.showLongerWalkingNotice, true);
    assert.equal(LONGER_WALKING_NOTICE, "Ez az útvonal hosszabb gyaloglással jár.");
    const less = details("SIGNIFICANT_REALTIME_DEGRADATION", journey([walk(2), transit("C1", 3, 30), walk(3)], { arrivalTime: iso(33) }));
    assert.equal(less.extraWalkingMinutes, -7);
    assert.equal(less.showLongerWalkingNotice, false);
    const unknown = details("CANCELLED", journey([{ ...walk(2), durationMinutes: Number.NaN } as JourneyLeg], { arrivalTime: iso(33) }));
    assert.equal(unknown.extraWalkingMinutes, null);
    assert.equal(unknown.showLongerWalkingNotice, false);
  });
  test("időkülönbség csak megbízható esetben: késésnél igen, kimaradásnál / elveszett csatlakozásnál nem", () => {
    const delay = details("SIGNIFICANT_REALTIME_DEGRADATION");
    assert.equal(delay.arrivalDifferenceMinutes, 7); // eredeti 45 vs jelölt 38
    assert.match(delay.arrivalDifferenceLabel ?? "", /7 perccel korábban/);
    assert.equal(details("CANCELLED").arrivalDifferenceLabel, null);
    assert.equal(details("MISSED_CONNECTION").arrivalDifferenceLabel, null);
    const later = details("SIGNIFICANT_REALTIME_DEGRADATION", candidate({ arrivalTime: iso(50) }));
    assert.match(later.arrivalDifferenceLabel ?? "", /5 perccel később/);
  });
});

describe("kártyák (forrásszint)", () => {
  const preview = block('data-testid="live-alternative-preview-card"');
  const offer = block('data-testid="live-alternative-offer-card"');
  test("az előnézet minden részletet a modellből jelenít meg", () => {
    for (const re of [
      /liveAlternativeOfferDetails\?\.reasonLabel/,
      /Várható érkezés: \{liveAlternativeOfferDetails\.arrivalLabel\}/,
      /Menetidő: \$\{liveAlternativeOfferDetails\.durationMinutes\} perc/,
      /\$\{liveAlternativeOfferDetails\.transfers\} átszállás/,
      /Gyaloglás: kb\. \{liveAlternativeOfferDetails\.walkingMinutes\} perc/,
      /\{LONGER_WALKING_NOTICE\}/,
      /liveAlternativeOfferDetails\.arrivalDifferenceLabel/,
    ]) assert.match(preview, re);
    assert.doesNotMatch(preview, /new Date\(liveAlternativeOffer\.candidateJourney\.arrivalTime\)/, "nincs nyers, ellenőrizetlen dátum");
    assert.match(offer, /liveAlternativeOfferDetails\?\.reasonLabel/);
  });
  test("7) az előnézet nem változtat aktív útvonalat; a modell csak olvas", () => {
    assert.doesNotMatch(preview + offer, /setDisplayedJourney/);
    const model = readFileSync(join(process.cwd(), "components/vedett-utvonal/liveAlternativeOfferDetails.ts"), "utf8");
    assert.doesNotMatch(model, /setDisplayedJourney|fetch\(|localStorage|trackVedettRouteEvent/);
  });
  test("8) elfogadás és elutasítás változatlan (kétlépcsős döntés)", () => {
    assert.match(offer, /onClick=\{\(\) => setLiveAlternativePreviewOpen\(true\)\}/);
    assert.match(offer, /"Megnézem"/);
    assert.match(offer, /onClick=\{handleLiveAlternativeDecline\}/);
    assert.match(preview, /onClick=\{handleLiveAlternativeAccept\}/);
    assert.match(preview, /"Ezt választom"/);
    assert.match(preview, /Maradok az eredetin/);
  });
  test("9) kis képernyőn görgethető, a döntési gombok a kártyán belül maradnak, az instrukció alatt 12 px-lel", () => {
    for (const b of [preview, offer]) {
      assert.match(b, /overflow-y-auto/);
      assert.match(b, /style=\{liveAlternativeCardLayout\}/);
    }
    assert.ok(preview.indexOf("handleLiveAlternativeAccept") > preview.indexOf("Várható érkezés"), "a gombok a tartalom után, ugyanabban a görgethető kártyában");
  });
});
