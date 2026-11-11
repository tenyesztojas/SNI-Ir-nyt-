// Regresszió: POST /api/push/notify KIZÁRÓLAG adminnak küldhet push-értesítést
// az adminoknak (P1). A programajánló értesítése már nem ezen a végponton megy.
//   node --test --experimental-strip-types __tests__/family/push-admin-notify.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleAdminNotify, parseAdminNotifyRequest, type AdminNotifyDeps } from "../../lib/pushAdminNotify.ts";

function deps(admin: boolean | "throw") {
  const sent: Array<[string, string, string]> = [];
  const d: AdminNotifyDeps = {
    async isAdmin() {
      if (admin === "throw") throw new Error("auth down: secret detail");
      return admin;
    },
    async send(t, b, u) {
      sent.push([t, b, u]);
    },
  };
  return { d, sent };
}

const PROGRAM_PAYLOAD = { title: "📅 Új programajánlás", body: "Szenzoros játszóház - Budapest", url: "/admin/programok" };

describe("nem admin kérés: 403, nincs küldés", () => {
  test("anonim, a korábbi ProgramForm-kéréssel azonos tartalommal is elutasítva", async () => {
    const { d, sent } = deps(false);
    assert.deepEqual(await handleAdminNotify(PROGRAM_PAYLOAD, d), { status: 403, body: { ok: false } });
    assert.equal(sent.length, 0);
  });
  test("bejelentkezett nem admin, tetszőleges tartalom", async () => {
    const { d, sent } = deps(false);
    assert.equal((await handleAdminNotify({ title: "Sürgős", body: "Lépj be ide", url: "/admin" }, d)).status, 403);
    assert.equal(sent.length, 0);
  });
  test("nem adminnak hibás bemenetre sem ad 400-at (nincs visszajelzés)", async () => {
    const { d } = deps(false);
    assert.equal((await handleAdminNotify(null, d)).status, 403);
  });
  test("ha az admin-ellenőrzés hibát dob: 403, belső részlet nélkül", async () => {
    const { d, sent } = deps("throw");
    const r = await handleAdminNotify({ title: "X", body: "Y" }, d);
    assert.deepEqual(r, { status: 403, body: { ok: false } });
    assert.equal(JSON.stringify(r).includes("secret"), false);
    assert.equal(sent.length, 0);
  });
});

describe("admin kérés", () => {
  test("validált tartalom átmegy, alapértelmezett URL /admin", async () => {
    const { d, sent } = deps(true);
    assert.deepEqual(await handleAdminNotify({ title: " Teszt ", body: "Üzenet" }, d), { status: 200, body: { ok: true } });
    assert.deepEqual(sent, [["Teszt", "Üzenet", "/admin"]]);
  });
  test("relatív admin-URL megmarad", async () => {
    const { d, sent } = deps(true);
    await handleAdminNotify({ title: "T", body: "B", url: "/admin/programok?x=1" }, d);
    assert.equal(sent[0]![2], "/admin/programok?x=1");
  });
  const bad: unknown[] = [
    null, "szöveg", [], {}, { title: "T" }, { body: "B" }, { title: 1, body: "B" },
    { title: "", body: "B" }, { title: "T", body: "   " }, { title: "x".repeat(121), body: "B" },
    { title: "T", body: "x".repeat(501) }, { title: "T", body: "B", url: "https://evil.example" },
    { title: "T", body: "B", url: "//evil.example" }, { title: "T", body: "B", url: "/\\evil.example" },
    { title: "T", body: "B", url: "javascript:alert(1)" }, { title: "T", body: "B", url: "/a b" }, { title: "T", body: "B", url: 5 },
  ];
  for (const [i, b] of bad.entries()) {
    test(`admin, hibás bemenet #${i}: 400, nincs küldés`, async () => {
      const { d, sent } = deps(true);
      assert.deepEqual(await handleAdminNotify(b, d), { status: 400, body: { ok: false } });
      assert.equal(sent.length, 0);
    });
  }
  test("parse: érvényes relatív URL", () => {
    assert.deepEqual(parseAdminNotifyRequest({ title: "T", body: "B", url: "/admin" }), { title: "T", body: "B", url: "/admin" });
  });
});

describe("bekötés (forrás-ellenőrzés)", () => {
  const route = readFileSync("app/api/push/notify/route.ts", "utf8");
  test("a route a közös kezelőt és a meglévő admin-ellenőrzést használja", () => {
    assert.match(route, /handleAdminNotify\(raw, \{ isAdmin: isCurrentUserAdmin, send: sendAdminPush \}\)/);
    assert.doesNotMatch(route, /createAdminClient|programs/);
  });
});
