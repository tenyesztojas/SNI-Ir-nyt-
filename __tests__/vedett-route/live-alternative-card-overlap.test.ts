// VÉDETT ÚTVONAL — Live Alternative kártya nem csúszhat az instrukciós kártya alá
//   node --test __tests__/vedett-route/live-alternative-card-overlap.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeStackedOverlayLayout,
  STACKED_OVERLAY_BOTTOM_RESERVE_PX,
  STACKED_OVERLAY_FALLBACK_TOP_PX,
  STACKED_OVERLAY_GAP_PX,
  STACKED_OVERLAY_MIN_HEIGHT_PX,
} from "../../components/vedett-utvonal/overlayStacking.ts";

const form = readFileSync(join(process.cwd(), "components/vedett-utvonal/VedettUtvonalSearchForm.tsx"), "utf8");
const block = (marker: string) => {
  const i = form.indexOf(marker);
  assert.ok(i >= 0, marker);
  return form.slice(i, form.indexOf("</div>\n            )}", i));
};

describe("elrendezés-számítás", () => {
  test("az ajánlat a mért instrukciós kártya alá kerül, legalább 12 px térközzel", () => {
    const l = computeStackedOverlayLayout({ anchorBottomPx: 180, topActionBarBottomPx: 52 });
    assert.equal(STACKED_OVERLAY_GAP_PX, 12);
    assert.equal(l.top, "192px");
  });
  test("magas (többsoros, pl. leszállás-megerősítős) instrukciós kártya alá is", () => {
    assert.equal(computeStackedOverlayLayout({ anchorBottomPx: 310.4, topActionBarBottomPx: 52 }).top, "322px");
  });
  test("instrukció nélkül: a felső gombsor alá, de sosem a korábbi 68 px fölé", () => {
    assert.equal(computeStackedOverlayLayout({ anchorBottomPx: null, topActionBarBottomPx: 100 }).top, "112px");
    assert.equal(computeStackedOverlayLayout({ anchorBottomPx: null, topActionBarBottomPx: 40 }).top, `${STACKED_OVERLAY_FALLBACK_TOP_PX}px`);
    assert.equal(computeStackedOverlayLayout({ anchorBottomPx: null, topActionBarBottomPx: null }).top, "68px");
  });
  test("kis képernyő: max-height a konténerhez igazodik (ETA-sáv fenntartva), minimum magassággal → belső görgetés", () => {
    const l = computeStackedOverlayLayout({ anchorBottomPx: 200, topActionBarBottomPx: 52 });
    assert.equal(l.maxHeight, `max(${STACKED_OVERLAY_MIN_HEIGHT_PX}px, calc(100% - 212px - ${STACKED_OVERLAY_BOTTOM_RESERVE_PX}px))`);
  });
  test("érvénytelen mérés nem tolja el (fail-safe)", () => {
    assert.equal(computeStackedOverlayLayout({ anchorBottomPx: Number.NaN, topActionBarBottomPx: null }).top, "68px");
  });
});

describe("bekötés (forrásszint)", () => {
  for (const marker of ['data-testid="live-alternative-offer-card"', 'data-testid="live-alternative-preview-card"']) {
    test(`${marker}: mért pozíció, az instrukció fölötti réteg, belső görgetés, nincs fix 68 px`, () => {
      const b = block(marker);
      assert.match(b, /style=\{liveAlternativeCardLayout\}/);
      assert.match(b, /\bz-30\b/, "az instrukciós kártya (z-20) fölött");
      assert.match(b, /overflow-y-auto/);
      assert.doesNotMatch(b, /top-\[4\.25rem\]/);
    });
  }
  test("a gombok és a szöveg változatlanok és kattinthatók (nincs pointer-events-none)", () => {
    const offer = block('data-testid="live-alternative-offer-card"');
    const preview = block('data-testid="live-alternative-preview-card"');
    assert.match(offer, /onClick=\{\(\) => setLiveAlternativePreviewOpen\(true\)\}/);
    assert.match(offer, /onClick=\{handleLiveAlternativeDecline\}/);
    assert.match(preview, /onClick=\{handleLiveAlternativeAccept\}/);
    assert.match(preview, /Várható érkezés:/);
    assert.doesNotMatch(offer + preview, /pointer-events-none/);
  });
  test("az instrukciós kártya mérése: ref + ResizeObserver + resize, fallback ResizeObserver nélkül", () => {
    assert.match(form, /ref=\{navigationInstructionCardRef\}/);
    assert.match(form, /const update = \(\) => setNavigationInstructionCardBottomPx\(card\.offsetTop \+ card\.offsetHeight\);/);
    assert.match(form, /anchorBottomPx: navigationInstructionCardVisible \? navigationInstructionCardBottomPx : null,/);
  });
  test("a többi felső kártya és a navigációs gombsor pozíciója nem változott", () => {
    assert.match(form, /ref=\{topActionBarRef\} className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-2"/);
    assert.equal((form.match(/top-\[4\.25rem\] z-20/g) ?? []).length, 3, "OFF_ROUTE, GPS-vesztés, korábbi járat — érintetlen");
  });
});
