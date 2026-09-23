// VÉDETT ÚTVONAL — Főoldali kiemelés és hero-szöveg (Round 9,
// "UX-fejlesztés, főoldali kiemelés és a Béta megjelölés eltávolítása" kör,
// B) rész).
//
// app/page.tsx egy async Server Component (Next.js), plain `node --test`
// alatt nem renderelhető — a projekt meglévő mintáját követve
// forráskód-szintű, strukturális regressziós tesztekkel fedjük le (lásd
// pl. navigate-button-integration.test.ts "Főoldali hero" describe blokkja
// vagy accessibility-mvp.test.ts).
//
//   node --test __tests__/vedett-route/homepage-vedett-utvonal-hero.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const HOME_PAGE_PATH = join(ROOT, "app", "page.tsx");
const homeSrc = readFileSync(HOME_PAGE_PATH, "utf-8");

describe("B) FŐOLDALI SORREND — a Védett Útvonal blokk a 'Böngéssz kategória szerint' blokk ELŐTT jelenik meg", () => {
  test("a 'VÉDETT ÚTVONAL HERO' szekció a forrásban KORÁBBAN áll, mint a 'Böngéssz kategória szerint' szöveg", () => {
    const vedettIdx = homeSrc.indexOf("VÉDETT ÚTVONAL HERO");
    const categoriesIdx = homeSrc.indexOf("Böngéssz kategória szerint");
    assert.ok(vedettIdx !== -1, "a Védett Útvonal hero szekciónak léteznie kell");
    assert.ok(categoriesIdx !== -1, "a 'Böngéssz kategória szerint' szekciónak léteznie kell");
    assert.ok(
      vedettIdx < categoriesIdx,
      "a Védett Útvonal blokknak a 'Böngéssz kategória szerint' blokk ELŐTT kell állnia (Round 9, B) rész — korábban ez fordítva volt)"
    );
  });

  test("a globális VEDETT_ROUTE_ENABLED feature flag (vedettRouteEnabled) mögötti feltétel VÁLTOZATLANUL megvan az áthelyezés után is — a sorrendváltás nem érintette a kill switch logikát", () => {
    assert.match(homeSrc, /const vedettRouteEnabled = isVedettRouteFeatureEnabled\(\);/);
    assert.match(homeSrc, /\{vedettRouteEnabled && \(/);
  });

  test("a többi főoldali szekció (HERO, PROGRAMAJÁNLÓ, KÖZÖSSÉGI PLATFORM, CTA, PARTNER) sorrendje VÁLTOZATLAN maradt — csak a Védett Útvonal és a kategória-szekció cserélt helyet", () => {
    const order = ["{/* HERO */}", "VÉDETT ÚTVONAL HERO", "Böngéssz kategória szerint", "{/* PROGRAMAJÁNLÓ */}", "KÖZÖSSÉGI PLATFORM SZEKCIÓ", "{/* CTA */}", "{/* PARTNER */}"];
    const indices = order.map((marker) => homeSrc.indexOf(marker));
    indices.forEach((idx, i) => assert.ok(idx !== -1, `'${order[i]}' szekció-jelölőnek léteznie kell`));
    for (let i = 1; i < indices.length; i++) {
      assert.ok(
        indices[i - 1] < indices[i],
        `a szekciók sorrendjének '${order.join("' < '")}' kell lennie — '${order[i - 1]}' nem állhat '${order[i]}' UTÁN`
      );
    }
  });
});

describe("B) FŐOLDALI HERO-SZÖVEG — a specifikáció szerinti végleges tartalom", () => {
  test("a headline pontosan 'Ne csak azt nézd, merre gyorsabb.' / 'Nézd azt is, merre könnyebb az út.' (vizuálisan hangsúlyos <h2>)", () => {
    assert.match(
      homeSrc,
      /<h2 className="text-xl font-bold text-gray-900 sm:text-2xl">\s*\n\s*Ne csak azt nézd, merre gyorsabb\.\s*\n\s*<br className="hidden sm:block" \/> Nézd azt is, merre könnyebb az út\.\s*\n\s*<\/h2>/
    );
  });

  test("a törzsszöveg pontosan a specifikáció szerinti mondatot tartalmazza (2026-09-23 frissítés: nem kizárólag budapesti, lásd riport 2. pont)", () => {
    assert.match(
      homeSrc,
      /A Védett Útvonal autista és ADHD-s embereknek, valamint érintett családoknak\s*\n\s*segít olyan útvonalat választani — Budapesten és azon kívül is —, amelynél nem\s*\n\s*csak az érkezési idő számít\./
    );
    assert.doesNotMatch(homeSrc, /budapesti útvonalat választani/);
  });

  test("a képességlista tartalmazza mind a hat elemet, a specifikáció szerinti sorrendben, 'valós idejű forgalmi adatok' szöveggel (nem a korábbi 'valós idejű BKK-adatok')", () => {
    // A tényleges <span> elemekben megjelenő lista sorrendjét vizsgáljuk —
    // a fenti magyarázó KÓD-KOMMENT (ami maga is említi a "valós idejű
    // forgalmi adatok" szöveget dokumentációs célból) ezért szándékosan
    // KIMARAD a keresésből: a kezdőpont a tényleges <div>...</div>
    // képességlista-konténer.
    const listContainerIdx = homeSrc.indexOf('<div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-medium text-gray-500 sm:text-sm">');
    assert.ok(listContainerIdx !== -1, "a képességlista <div> konténerének léteznie kell");
    const listBlock = homeSrc.slice(listContainerIdx, listContainerIdx + 700);
    const items = [
      "Szenzoros terhelés",
      "kevesebb átszállás",
      "kevesebb gyaloglás",
      "valós idejű forgalmi adatok",
      "pihenőpontok",
      "lépcsőmentes útvonal",
    ];
    const indices = items.map((item) => listBlock.indexOf(item));
    indices.forEach((idx, i) => assert.ok(idx !== -1, `'${items[i]}' képesség-elemnek szerepelnie kell a listában`));
    for (let i = 1; i < indices.length; i++) {
      assert.ok(indices[i - 1] < indices[i], `a képességlista elemeinek a specifikáció sorrendjében kell állniuk`);
    }
    assert.doesNotMatch(homeSrc, /valós idejű BKK-adatok/, "a korábbi, BKK-specifikus szövegnek el kellett tűnnie");
  });

  test("a CTA gomb felirata pontosan 'Megtervezem az útvonalam', és belső Next.js <Link href=\"/vedett-utvonal\"> -ot használ (nem hardcode-olt teljes URL-t)", () => {
    const heroIdx = homeSrc.indexOf("VÉDETT ÚTVONAL HERO");
    const heroBlock = homeSrc.slice(heroIdx, heroIdx + 3000);
    assert.match(heroBlock, /<Link\s*\n\s*href="\/vedett-utvonal"/, "a CTA-nak Next.js <Link>-nek kell lennie, /vedett-utvonal href-fel");
    assert.match(heroBlock, /Megtervezem az útvonalam/);
    assert.doesNotMatch(homeSrc, /href="https:\/\/[^"]*\/vedett-utvonal"/, "nem szabad hardcode-olt teljes production URL-t használni a CTA-hoz");
  });

  test("a blokk alján pontosan a specifikáció szerinti lábsor jelenik meg: 'BKK, MÁV, Volánbusz és MOL Bubi – Próbáld ki, és segíts a visszajelzéseddel még jobbá tenni.'", () => {
    assert.match(homeSrc, /BKK, MÁV, Volánbusz és MOL Bubi – Próbáld ki, és segíts a visszajelzéseddel még jobbá tenni\./);
  });

  test("BRANDING FRISSÍTÉS (2026-09-20) — a badge-pill a hivatalos logót (ikon + felirat-kép) jeleníti meg a sima szöveg helyett, 'Béta' szó nélkül", () => {
    const badgeIdx = homeSrc.indexOf('<div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sni-brand-teal/15');
    assert.ok(badgeIdx !== -1, "a badge-pill konténernek léteznie kell");
    const badgeBlock = homeSrc.slice(badgeIdx, badgeIdx + 400);
    assert.match(badgeBlock, /<img src="\/vedett-utvonal-logo-icon\.png" alt="" aria-hidden="true"/, "a dekoratív logó-ikonnak meg kell jelennie a felirat-kép ELŐTT");
    assert.match(badgeBlock, /<img src="\/vedett-utvonal-wordmark\.png" alt="Védett Útvonal"/, "a felirat-képnek 'Védett Útvonal' alt szöveggel kell rendelkeznie (hozzáférhető név)");
    assert.doesNotMatch(badgeBlock, /Béta/i, "a 'Béta' szó nem térhet vissza");
  });
});
