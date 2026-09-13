// VÉDETT ÚTVONAL — STREET-LEVEL FALLBACK CTA KONTRASZT HOTFIX (2026-09-13)
//
// Preview acceptance során jelzett UI/UX hiba: a house_number_not_resolved
// inline figyelmeztetőkártyán az elsődleges CTA ("Az utca közelítő helyével
// tervezek") olvashatatlan / túl halvány / vizuálisan majdnem disabled
// állapotúnak látszott, miközben a másodlagos gomb ("Módosítom a címet")
// jól olvasható maradt.
//
// ROOT CAUSE (forráskód-szintű auditból, lásd VedettUtvonalSearchForm.tsx
// házszámos fallback blokkjának 2026-09-13-as kommentje): a gomb a
// `border-sni-primary bg-sni-primary ... hover:bg-sni-primary/90` Tailwind
// osztályokat használta. A `sni-primary` szín NINCS definiálva sehol
// (tailwind.config.ts theme.extend.colors.sni csak bg/blue/bluedark/green/
// greendark/beige/text/warn/brand.teal/brand.blue/brand.navy kulcsokat
// ismer) — Tailwind ezért EGYETLEN szabályt sem generált hozzá, a gomb
// háttere transzparens maradt, a `text-white` felirat pedig fehér/átlátszó
// alapon majdnem láthatatlanná vált. UGYANEZ a root cause-minta már egyszer
// dokumentálva és javítva lett a DestinationMapPicker.tsx "Ez legyen a cél"
// gombjánál (RUNTIME UX HOTFIX, 2026-09-10).
//
// MIÉRT NEM a megosztott `.btn-primary` osztály (globals.css)? Megfontoltuk
// — ezt használja pl. lejjebb a fő "Tervezem az útvonalat" submit gomb is,
// és valódi, generált CSS-t adna (nem transzparens hátteret) —, DE a
// `.btn-primary` ALAP (nem hover) állapota `bg-sni-brand-teal` (#34D8C3)
// háttéren fehér szöveget használ, aminek SZÁMOLT WCAG kontrasztaránya
// kb. 1.8:1 — messze a normál szövegre előírt 4.5:1 alatt (a gomb 14px,
// font-semibold szövege NEM minősül WCAG "nagy szövegnek": ahhoz legalább
// 700-as, explicit "bold" súly kellene). Ez egy MÁSIK, szélesebb körű, az
// egész appot érintő kontraszt-kérdés, ami a jelenlegi, "kizárólag a
// street-level fallback CTA" feladatkörön KÍVÜL esik — ezt a hotfix
// explicit NEM módosítja. Ehelyett a szintén MEGLÉVŐ, tailwind.config.ts-
// ben már definiált `sni-brand-navy` (#123A5C) tokent használjuk fehér
// szöveggel — SZÁMOLT kontraszt kb. 11.8:1 (WCAG AAA szintet is
// túlteljesíti), és megtartja a kártya eredeti rounded-lg/px-4 py-2.5/
// text-sm méretezését (illeszkedik a "Módosítom a címet" másodlagos
// gombhoz).
//
// FONTOS: a gomb SOHA nem volt ténylegesen `disabled` HTML attribútummal
// ellátva ebben a hibás állapotban — kizárólag vizuálisan tűnt annak. A
// javítás után a gomb genuine `disabled={disabled || loading}` gate-et
// kap (feature-flag VAGY ténylegesen folyamatban lévő submit), a
// `disabled:opacity-50 disabled:cursor-not-allowed` Tailwind-variánsok
// pedig KIZÁRÓLAG a natív `disabled` attribútum jelenlétekor futnak le —
// normál (nem-submitting) fallback megjelenéskor a gomb 100%-ban enabled
// és teljes kontrasztú.
//
// Nincs jsdom/@testing-library/react ebben a projektben — a UI-réteg
// ellenőrzése a projekt már meglévő mintáját követve (lásd
// accessibility-mvp.test.ts, structured-address-and-sensory-ux.test.ts)
// forráskód-szintű, strukturális regresszió-teszt.
//
//   node --experimental-strip-types --test __tests__/vedett-route/street-level-fallback-cta-contrast.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "components",
  "vedett-utvonal",
  "VedettUtvonalSearchForm.tsx"
);
const formSrc = readFileSync(FORM_PATH, "utf-8");

// A "house_number_not_resolved" fallback kártya teljes JSX blokkja — a
// nyitó feltételtől ("A pontos házszámot nem tudtuk azonosítani") a záró
// </div>-ig, a "Módosítom a címet" gomb blokkjának végéig.
const fallbackCardMatch = formSrc.match(
  /result\.reason === "house_number_not_resolved" && \(([\s\S]*?)Módosítom a címet[\s\S]*?<\/button>\s*\n\s*<\/div>\s*\n\s*<\/div>\s*\n\s*\)\}/
);
const fallbackCardBlock = fallbackCardMatch?.[0] ?? "";

// WCAG relatív luminancia + kontrasztarány — sRGB hex színekre, a
// szabvány (WCAG 2.x) képlete szerint. Ez a segédfüggvény ÖNÁLLÓAN,
// pure-függvényként bizonyítja be a fenti kommentben állított
// kontraszt-számokat (1.8:1 teal/fehér, 11.8:1 navy/fehér) — nem csak
// hivatkozik rájuk.
function relativeLuminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [r, g, b].map(lin);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const SNI_BRAND_TEAL = "34D8C3";
const SNI_BRAND_NAVY = "123A5C";
const WHITE = "FFFFFF";
const WCAG_AA_NORMAL_TEXT_MIN_CONTRAST = 4.5;

describe("TASK — Street-level fallback CTA kontraszt hotfix (Preview acceptance hiba, 2026-09-13)", () => {
  test("a fallback kártya blokkja megtalálható a forrásban (előfeltétel a további asszerciókhoz)", () => {
    assert.ok(
      fallbackCardBlock.length > 0,
      "meg kell találni a house_number_not_resolved fallback kártya teljes JSX blokkját"
    );
  });

  test("KONTRASZT-BIZONYÍTÁS — a 'sni-brand-teal' (a megosztott .btn-primary alapszíne) fehér szövegen NEM felel meg a WCAG AA 4.5:1 minimumnak, ezért nem ezt választottuk erre a CTA-ra", () => {
    const ratio = contrastRatio(SNI_BRAND_TEAL, WHITE);
    assert.ok(
      ratio < WCAG_AA_NORMAL_TEXT_MIN_CONTRAST,
      `a sni-brand-teal/fehér kontraszt (${ratio.toFixed(2)}:1) meglepő módon elérné a 4.5:1-et — ellenőrizni kell a root cause dokumentációt`
    );
  });

  test("KONTRASZT-BIZONYÍTÁS — a választott 'sni-brand-navy' fehér szövegen jóval a WCAG AA 4.5:1 minimum FÖLÖTT van (ténylegesen AAA-t is teljesíti)", () => {
    const ratio = contrastRatio(SNI_BRAND_NAVY, WHITE);
    assert.ok(
      ratio >= WCAG_AA_NORMAL_TEXT_MIN_CONTRAST,
      `a sni-brand-navy/fehér kontrasztnak (${ratio.toFixed(2)}:1) el kell érnie a WCAG AA 4.5:1 minimumot`
    );
    assert.ok(ratio > 7, "a sni-brand-navy/fehér kontrasztnak a WCAG AAA (7:1) szintet is túl kell teljesítenie");
  });

  test("REGRESSZIÓ — a nem létező 'sni-primary' Tailwind token NEM térhet vissza a house_number_not_resolved fallback kártya JSX blokkjába (ez okozta az olvashatatlan/halvány CTA-t)", () => {
    // A tailwind.config.ts theme.extend.colors.sni kulcsai: bg, blue,
    // bluedark, green, greendark, beige, text, warn, brand.teal,
    // brand.blue, brand.navy — "primary" nincs köztük, sem app/globals.css
    // nem definiál ilyen CSS változót/osztályt. Bármilyen `sni-primary`
    // Tailwind utility (bg-/border-/text-/hover:bg-...) egy nem-generált,
    // hatástalan osztály, ami transzparens/láthatatlan elemet eredményez.
    //
    // MEGJEGYZÉS: a `sni-primary` token a fájl MÁS részein (pl. a
    // lépcsőmentes-kapcsoló badge-einél, az "Induló hely kijelölése a
    // térképen" / "address_approximate" CTA-nál) továbbra is előfordul —
    // ez egy SZÉLESEBB, a jelenlegi feladat körén ("kizárólag a
    // street-level fallback CTA") kívül eső, előzetesen létező jelenség,
    // amit ez a hotfix explicit NEM módosít (lásd a végső riport "root
    // cause" pontját). A regresszió-védelem ezért KIZÁRÓLAG a most
    // javított fallback-kártya blokkjára szűkül.
    assert.doesNotMatch(
      fallbackCardBlock,
      /sni-primary/,
      "a 'sni-primary' token nem létezik a design rendszerben — újbóli használata a fallback kártyán visszahozná az olvashatatlan CTA hibát"
    );
  });

  test("az elsődleges 'Az utca közelítő helyével tervezek' gomb (mindkét ág: origin ÉS destination) valós, generált Tailwind osztályokat használ (sni-brand-navy háttér + fehér szöveg), a nem létező sni-primary helyett", () => {
    const primaryButtonCount = (
      fallbackCardBlock.match(
        /className="flex min-h-\[44px\] w-full items-center justify-center rounded-lg border border-sni-brand-navy bg-sni-brand-navy px-4 py-2\.5 text-sm font-semibold text-white shadow-sm hover:bg-sni-brand-navy\/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"/g
      ) ?? []
    ).length;
    assert.equal(
      primaryButtonCount,
      2,
      "mindkét (origin 'from' és destination 'to') elfogadó gombnak a valós sni-brand-navy háttérszínt kell használnia, a régi, hatástalan sni-primary osztályok helyett"
    );
  });

  test("az elsődleges gomb NEM ténylegesen 'disabled' normál (nem submitting) fallback megjelenéskor — a disabled prop KIZÁRÓLAG a valódi 'disabled' (feature-flag) vagy 'loading' (folyamatban lévő submit) állapothoz kötött", () => {
    const disabledGateCount = (
      fallbackCardBlock.match(/disabled=\{disabled \|\| loading\}/g) ?? []
    ).length;
    assert.equal(
      disabledGateCount,
      2,
      "mindkét elfogadó gombnak explicit 'disabled={disabled || loading}' gate-et kell kapnia — genuine disabled állapot KIZÁRÓLAG bizonyított loading/feature-flag esetén"
    );
    // A korábbi (hibás) verzióban a gombokon EGYÁLTALÁN nem volt disabled
    // prop — ez önmagában nem volt hiba (a gomb nem volt ténylegesen
    // disabled), de a vizuális kontraszthiány miatt annak TŰNT. A javítás
    // után legalább a genuine loading-gate jelen van.
  });

  test("a 'disabled:opacity-50'/'disabled:cursor-not-allowed' Tailwind-variánsok a natív disabled attribútumhoz kötöttek — normál, enabled állapotban a gomb szövege NEM halványul el opacity-vel", () => {
    // A `disabled:*` Tailwind pszeudo-osztály-variáns KIZÁRÓLAG akkor
    // aktiválódik, ha a DOM-elemnek ténylegesen van `disabled` attribútuma
    // (natív HTML `:disabled` szelektor) — enabled állapotban a böngésző
    // ezt a CSS szabályt egyszerűen nem alkalmazza, tehát a szöveg
    // teljes, 100%-os opacitású marad. Ez a teszt azt védi, hogy a fix
    // ne egy feltétel nélküli, statikus opacity-csökkentő osztályt
    // (pl. sima "opacity-50" disabled: prefix nélkül) használjon.
    assert.doesNotMatch(
      fallbackCardBlock,
      /(?<!disabled:)\bopacity-\d+\b/,
      "a fallback kártya gombjain nem lehet feltétel nélküli (disabled: prefix nélküli) opacity-csökkentő osztály"
    );
  });

  test("a másodlagos 'Módosítom a címet' gomb VÁLTOZATLAN marad — jól olvasható amber stílus, nincs routing-hatása, és nem kapott disabled-gate-et (spec 4. pont: 'maradhat másodlagos CTA')", () => {
    assert.match(
      fallbackCardBlock,
      /className="flex min-h-\[44px\] w-full items-center justify-center rounded-lg border border-amber-400 bg-white px-4 py-2\.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 sm:w-auto"/
    );
    assert.match(
      fallbackCardBlock,
      /onClick=\{result\.field === "to" \? handleStreetLevelModifyTo : handleStreetLevelModifyFrom\}/
    );
    // A "Módosítom a címet" gomb NEM hívja a handleStreetLevelAccept*
    // függvényeket (amik routingot indítanak re-submit-tal) — csak a
    // handleStreetLevelModify* párt, ami törli a fallback state-et.
    const modifyButtonBlock =
      fallbackCardBlock.match(
        /<button\s+type="button"\s+onClick=\{result\.field === "to" \? handleStreetLevelModifyTo : handleStreetLevelModifyFrom\}[\s\S]*?<\/button>/
      )?.[0] ?? "";
    assert.ok(modifyButtonBlock.length > 0, "meg kell találni a 'Módosítom a címet' gomb önálló JSX blokkját");
    assert.doesNotMatch(modifyButtonBlock, /handleStreetLevelAccept(To|From)/);
    // A módosító gomb NEM kapott disabled-gate-et ebben a hotfixban —
    // spec szerint másodlagos CTA marad, viselkedése változatlan.
    assert.doesNotMatch(modifyButtonBlock, /disabled=/);
  });

  test("REGRESSZIÓ — az elfogadó gombok onClick handlerei (handleStreetLevelAcceptTo / handleStreetLevelAcceptFrom) VÁLTOZATLANOK — a kontraszt-javítás KIZÁRÓLAG className/disabled-prop szintű, a routing-indítási logikát nem érinti", () => {
    assert.match(fallbackCardBlock, /onClick=\{handleStreetLevelAcceptTo\}/);
    assert.match(fallbackCardBlock, /onClick=\{handleStreetLevelAcceptFrom\}/);
    // A handler-függvények maguk (state → MAP_PICKED, majd
    // pendingStreetLevelResubmit → requestSubmit) a fájl más részén,
    // ettől a JSX-blokktól függetlenül élnek — ez a teszt csak azt védi,
    // hogy a gombok MEGHÍVJÁK őket, a hívás módja nem változott.
    assert.match(formSrc, /function handleStreetLevelAcceptTo\(\)/);
    assert.match(formSrc, /function handleStreetLevelAcceptFrom\(\)/);
  });
});
