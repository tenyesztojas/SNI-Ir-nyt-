// Védett Útvonal támogatási oldal (App Store Guideline 1.5) — célzott, statikus teszt.
//   node --test --experimental-strip-types __tests__/vedett-route/support-page.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const PAGE = "app/vedett-utvonal/segitseg/page.tsx";
const src = readFileSync(PAGE, "utf8").replace(/\r\n/g, "\n");

describe("támogatási oldal tartalma", () => {
  test("cím és metaadat", () => {
    assert.match(src, /title: "Védett Útvonal – Segítség és támogatás"/);
    assert.match(src, /<h1[^>]*>Védett Útvonal – Segítség és támogatás<\/h1>/);
  });
  test("kattintható e-mail-cím, csak az igazolt cím", () => {
    assert.match(src, /const SUPPORT_EMAIL = "kapcsolat@vedettsarok\.hu";/);
    assert.match(src, /mailto:\$\{SUPPORT_EMAIL\}/);
    const emails = src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) ?? [];
    assert.deepEqual([...new Set(emails)], ["kapcsolat@vedettsarok.hu"]);
  });
  test("hibabejelentés előre kitöltött, URL-kódolt tárggyal", () => {
    assert.match(src, /subject=\$\{encodeURIComponent\("Védett Útvonal – hibabejelentés"\)\}/);
    const subject = encodeURIComponent("Védett Útvonal – hibabejelentés");
    assert.equal(decodeURIComponent(subject), "Védett Útvonal – hibabejelentés");
    assert.doesNotMatch(subject, /[ –éÚ]/);
  });
  test("hivatkozások csak létező oldalakra", () => {
    const hrefs = [...src.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(hrefs, ["/adatkezelesi-tajekoztato", "/aszf", "/fiok-torles", "/kapcsolat", "/vedett-utvonal/fiok"]);
    for (const h of hrefs) assert.ok(existsSync(`app${h}/page.tsx`), h);
  });
  test("biztonsági tájékoztatás", () => {
    assert.match(src, /nem segélyhívó szolgáltatás/);
    assert.match(src, /href="tel:112"/);
  });
});

describe("nyilvános, statikus, követés nélkül", () => {
  test("nincs bejelentkezés, átirányítás, kliens-JS, analitika vagy külső szolgáltatás", () => {
    assert.doesNotMatch(src, /"use client"|redirect\(|getUser|getCurrentUser|createClient|cookies\(|headers\(/);
    assert.doesNotMatch(src, /gtag|analytics|trackVedettRouteEvent|GoogleLoginButton|<script|https?:\/\//i);
    assert.doesNotMatch(src, /fetch\(|<form/);
  });
});
