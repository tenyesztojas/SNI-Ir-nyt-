// Védett Útvonal — ACCOUNT ACCESS (email/jelszó fázis, 2026-10-03).
//
// Nincs külön Védett Útvonal fiók: minden belépés/regisztráció/kilépés a
// MEGLÉVŐ VédettSarok Supabase Auth-ot használja. Tiszta egység (safeReturnPath
// helper) + statikus forrás-regressziós tesztek (a többi vedett-route teszt
// stílusában).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  safeReturnPath,
  isVedettUtvonalReturnPath,
} from "../../lib/pwa/safeReturnPath.ts";

const read = (p: string) => readFileSync(p, "utf8");
const page = read("app/vedett-utvonal/page.tsx");
const belepes = read("app/belepes/page.tsx");
const actions = read("lib/actions/auth.ts");
const callback = read("app/auth/callback/route.ts");

describe("safeReturnPath / isVedettUtvonalReturnPath", () => {
  test("Védett Útvonal next felismerése", () => {
    assert.equal(isVedettUtvonalReturnPath("/vedett-utvonal"), true);
    assert.equal(isVedettUtvonalReturnPath("/vedett-utvonal/app"), true);
    assert.equal(isVedettUtvonalReturnPath("/vedett-utvonal?x=1"), true);
  });
  test("nem Védett Útvonal / nem biztonságos next elutasítva", () => {
    for (const bad of [
      "//evil.com", "https://evil.com", "/vedett-utvonalx", "/profil",
      "vedett-utvonal", "", null, undefined, "/vedett-utvonal://x",
    ]) {
      assert.equal(isVedettUtvonalReturnPath(bad as string | null | undefined), false, String(bad));
    }
  });
  test("unsafe next -> fallback", () => {
    assert.equal(safeReturnPath("//evil.com", "/profil"), "/profil");
    assert.equal(safeReturnPath("https://evil.com", "/"), "/");
    assert.equal(safeReturnPath("/vedett-utvonal", "/profil"), "/vedett-utvonal");
  });
});

describe("Védett Útvonal oldal: account entry", () => {
  test("anonim: Belépés link a meglévő /belepes?next= mintával", () => {
    assert.match(page, /\{user \? \([\s\S]*?\) : \(\s*<Link\s+href="\/belepes\?next=%2Fvedett-utvonal"[\s\S]*?Belépés/);
  });
  test("bejelentkezve: név/email + Kilépés, next=/vedett-utvonal", () => {
    assert.match(page, /profile\?\.displayName \|\| user\.email/);
    assert.match(page, /<form action=\{signOutAction\}>\s*<input type="hidden" name="next" value="\/vedett-utvonal" \/>/);
    assert.match(page, />\s*Kilépés\s*</);
  });
  test("a meglévő signOutAction-t használja, nincs külön auth", () => {
    assert.match(page, /import \{ signOutAction \} from "@\/lib\/actions\/auth"/);
  });
  test("az anonim workspace továbbra is elérhető (nincs login-kapu)", () => {
    assert.match(page, /VEDETT_ROUTE_ACCESS_LEVEL !== "public"/);
    assert.match(page, /isAuthenticated=\{Boolean\(user\)\}/);
  });
});

describe("/belepes: Védett Útvonal auth mode", () => {
  test("a mode a sanitizált next-ből jön", () => {
    assert.match(belepes, /const vuMode = isVedettUtvonalReturnPath\(searchParams\?\.next\)/);
  });
  test("Google belépés csak a normál ágban renderelődik", () => {
    const vuIdx = belepes.indexOf("vuMode ? (");
    const googleIdx = belepes.indexOf("<GoogleLoginButton />");
    const elseIdx = belepes.indexOf(") : (", vuIdx);
    assert.ok(vuIdx > 0 && googleIdx > elseIdx, "Google a normál (else) ágban");
    assert.equal((belepes.match(/<GoogleLoginButton \/>/g) ?? []).length, 1);
  });
  test("közösségi opt-in rejtve VU módban", () => {
    assert.match(belepes, /\{!vuMode && \(\s*<div className="rounded-xl border border-sni-brand-teal\/30[\s\S]*?joinCommunity/);
  });
  test("Vissza a Védett Útvonalhoz link", () => {
    assert.match(belepes, /href="\/vedett-utvonal"[\s\S]*?Vissza a Védett Útvonalhoz/);
  });
  test("a next mindkét form hidden mezőjében megmarad", () => {
    assert.equal((belepes.match(/<input type="hidden" name="next" value=\{safeNext\} \/>/g) ?? []).length, 2);
  });
  test("normál /belepes szöveg és Google változatlan", () => {
    assert.match(belepes, /Üdv a VédettSaroknál/);
    assert.match(belepes, /Lépj be e-maillel vagy regisztrálj új fiókot\./);
  });
  test("nincs localStorage-alapú auth", () => {
    assert.doesNotMatch(belepes + actions + page, /localStorage|sessionStorage/);
  });
});

describe("auth actionök", () => {
  test("login next sanitizálva (változatlan alapértelmezés /profil)", () => {
    assert.match(actions, /signInWithPassword/);
    assert.match(actions, /safeReturnPath\(String\(formData\.get\("next"\) \?\? ""\), "\/profil"\)/);
  });
  test("regisztráció a meglévő supabase.auth.signUp-ot használja", () => {
    assert.equal((actions.match(/auth\.signUp\(/g) ?? []).length, 1);
    assert.doesNotMatch(actions, /from\("vedett_?utvonal_?(users|profiles|accounts)"\)/i);
  });
  test("emailRedirectTo csak VU módban, a meglévő /auth/callback-re, sanitizált next-tel", () => {
    assert.match(actions, /fromVedettUtvonal\s*\?\s*\{\s*emailRedirectTo: `\$\{siteUrl\}\/auth\/callback\?next=\$\{encodeURIComponent\(\s*safeReturnPath\(rawNext/);
  });
  test("VU megerősítési üzenet: nincs automatikus belépés állítás", () => {
    assert.match(actions, /térj vissza a Védett Útvonal alkalmazásba, és lépj be/);
    assert.doesNotMatch(actions, /automatikusan (be)?lép/i);
  });
  test("logout: return-aware, alapértelmezett cél '/'", () => {
    assert.match(actions, /export async function signOutAction\(formData\?: FormData\)/);
    assert.match(actions, /formData \? String\(formData\.get\("next"\) \?\? ""\) : "",\s*"\/"/);
  });
  test("a meglévő logout hívók (next nélkül) nem változnak", () => {
    for (const f of ["app/profil/page.tsx", "components/HeaderClient.tsx"]) {
      const s = read(f);
      assert.match(s, /<form action=\{signOutAction\}>/);
      assert.doesNotMatch(s, /name="next"/);
    }
  });
});

describe("/auth/callback next", () => {
  test("next sanitizált, alapértelmezés /profil", () => {
    assert.match(callback, /safeReturnPath\(searchParams\.get\("next"\), "\/profil"\)/);
    assert.match(callback, /NextResponse\.redirect\(`\$\{origin\}\$\{nextPath\}`\)/);
  });
  test("a popup ág és az exchangeCodeForSession változatlan", () => {
    assert.match(callback, /exchangeCodeForSession\(code\)/);
    assert.match(callback, /window\.location\.replace\("\/profil"\)/);
  });
});

describe("UI cleanup: tesztelési figyelmeztetés eltávolítva, lábléc", () => {
  test("a bevezető tesztelési figyelmeztetés nincs az oldalon", () => {
    assert.doesNotMatch(page, /tesztelés alatt áll/);
    assert.doesNotMatch(page, /pihenőpont-adatok/);
  });
  test("saját lábléc a meglévő jogi route-okkal", () => {
    assert.match(page, /<footer[\s\S]*?© 2026 VédettSarok — Minden jog fenntartva/);
    assert.match(page, /href="\/aszf"[\s\S]*?Általános Szerződési Feltételek/);
    assert.match(page, /href="\/adatkezelesi-tajekoztato"[\s\S]*?Adatkezelési tájékoztató/);
  });
  test("a lábléc user-feltételtől független (anonim + bejelentkezett)", () => {
    const f = page.slice(page.indexOf("<footer"), page.indexOf("</footer>"));
    assert.doesNotMatch(f, /user|isAuthenticated/);
  });
  test("a globális Footer nem kerül vissza a layoutban", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    assert.match(layout, /\{!hideSiteChrome && <Footer \/>\}/);
    assert.doesNotMatch(page, /components\/Footer/);
  });
  test("a jogi route-ok léteznek", () => {
    readFileSync("app/aszf/page.tsx", "utf8");
    readFileSync("app/adatkezelesi-tajekoztato/page.tsx", "utf8");
  });
});
