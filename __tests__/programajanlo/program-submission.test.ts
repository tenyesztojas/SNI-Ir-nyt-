// Programajánló szerveroldali beküldése: validálás, sebességkorlát, egy
// beszúrás, sikeres beszúrás után legfeljebb egy admin push-kísérlet.
//   node --test --experimental-strip-types __tests__/programajanlo/program-submission.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROGRAM_NOTIFY_TITLE,
  PROGRAM_NOTIFY_URL,
  PROGRAM_SUBMIT_ERRORS,
  PROGRAM_SUBMIT_RATE_LIMIT,
  submitProgram,
  validateProgramInput,
  type ProgramInput,
  type ProgramSubmitDeps,
} from "../../lib/programSubmission.ts";
import { MemoryRateLimiter } from "../../lib/rate-limit/memory.ts";

const VALID = {
  name: "Szenzoros játszóház",
  location: "Budapest, XII. ker.",
  eventDate: "2026-11-20",
  description: "Rövid leírás",
  url: "",
  contact: "",
};

function deps(o: { allow?: boolean | "throw"; insert?: boolean | "throw"; push?: "throw"; limiter?: () => Promise<boolean> } = {}) {
  const calls = { rate: 0, inserts: [] as ProgramInput[], pushes: [] as Array<[string, string, string]> };
  const d: ProgramSubmitDeps = {
    async allowByRateLimit() {
      calls.rate++;
      if (o.limiter) return o.limiter();
      if (o.allow === "throw") throw new Error("upstash down");
      return o.allow ?? true;
    },
    async insert(v) {
      calls.inserts.push(v);
      if (o.insert === "throw") throw new Error("db down");
      return o.insert ?? true;
    },
    async notifyAdmins(t, b, u) {
      calls.pushes.push([t, b, u]);
      if (o.push === "throw") throw new Error("push down");
    },
  };
  return { d, calls };
}

describe("sikeres (anonim) beküldés", () => {
  test("egy beszúrás, majd pontosan egy push-kísérlet rögzített címmel és URL-lel", async () => {
    const { d, calls } = deps();
    assert.deepEqual(await submitProgram(VALID, d), { ok: true });
    assert.deepEqual(calls.inserts, [{
      name: "Szenzoros játszóház", location: "Budapest, XII. ker.", event_date: "2026-11-20",
      description: "Rövid leírás", url: null, contact: null,
    }]);
    assert.deepEqual(calls.pushes, [[PROGRAM_NOTIFY_TITLE, "Szenzoros játszóház - Budapest, XII. ker.", PROGRAM_NOTIFY_URL]]);
  });
  test("opcionális webcím és kontakt megmarad", async () => {
    const { d, calls } = deps();
    await submitProgram({ ...VALID, url: " https://pelda.hu/program ", contact: "info@pelda.hu" }, d);
    assert.equal(calls.inserts[0]!.url, "https://pelda.hu/program");
    assert.equal(calls.inserts[0]!.contact, "info@pelda.hu");
  });
  test("sikertelen push: a beküldés sikeres marad, nincs új beszúrás és nincs újrapróbálkozás", async () => {
    const { d, calls } = deps({ push: "throw" });
    assert.deepEqual(await submitProgram(VALID, d), { ok: true });
    assert.equal(calls.inserts.length, 1);
    assert.equal(calls.pushes.length, 1);
  });
  test("párhuzamos beküldések: hívásonként legfeljebb egy push (külön beküldés = külön sor)", async () => {
    const { d, calls } = deps();
    const rs = await Promise.all([submitProgram(VALID, d), submitProgram(VALID, d), submitProgram(VALID, d)]);
    assert.ok(rs.every((r) => r.ok));
    assert.equal(calls.inserts.length, 3);
    assert.equal(calls.pushes.length, 3);
  });
});

describe("sikertelen beszúrás: nincs push", () => {
  for (const insert of [false, "throw"] as const) {
    test(`insert=${insert}`, async () => {
      const { d, calls } = deps({ insert });
      assert.deepEqual(await submitProgram(VALID, d), { ok: false, error: PROGRAM_SUBMIT_ERRORS.generic });
      assert.equal(calls.inserts.length, 1);
      assert.equal(calls.pushes.length, 0);
    });
  }
});

describe("sebességkorlát", () => {
  test("elutasított kérés: nincs beszúrás, nincs push", async () => {
    const { d, calls } = deps({ allow: false });
    assert.deepEqual(await submitProgram(VALID, d), { ok: false, error: PROGRAM_SUBMIT_ERRORS.rateLimited });
    assert.equal(calls.inserts.length, 0);
    assert.equal(calls.pushes.length, 0);
  });
  test("a korlátozó hibája esetén fail closed", async () => {
    const { d, calls } = deps({ allow: "throw" });
    assert.deepEqual(await submitProgram(VALID, d), { ok: false, error: PROGRAM_SUBMIT_ERRORS.generic });
    assert.equal(calls.inserts.length, 0);
  });
  test("a meglévő MemoryRateLimiterrel: ugyanarról az IP-ről a 6. beküldés elutasítva", async () => {
    const limiter = new MemoryRateLimiter();
    const { d, calls } = deps({
      limiter: async () =>
        (await limiter.check("rl:program-submit:1.2.3.4", PROGRAM_SUBMIT_RATE_LIMIT.limit, PROGRAM_SUBMIT_RATE_LIMIT.windowMs)).allowed,
    });
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await submitProgram(VALID, d));
    assert.deepEqual(results.map((r) => r.ok), [true, true, true, true, true, false]);
    assert.equal(calls.inserts.length, 5);
    assert.equal(calls.pushes.length, 5);
  });
});

describe("hibás bemenet: elutasítva, korlátozó / beszúrás / push nélkül", () => {
  const bad: Array<[unknown, string]> = [
    [null, PROGRAM_SUBMIT_ERRORS.invalid],
    ["x", PROGRAM_SUBMIT_ERRORS.invalid],
    [{ ...VALID, name: "  " }, PROGRAM_SUBMIT_ERRORS.invalid],
    [{ ...VALID, location: undefined }, PROGRAM_SUBMIT_ERRORS.invalid],
    [{ ...VALID, description: 5 }, PROGRAM_SUBMIT_ERRORS.invalid],
    [{ ...VALID, contact: 5 }, PROGRAM_SUBMIT_ERRORS.invalid],
    [{ ...VALID, eventDate: "2026-02-30" }, PROGRAM_SUBMIT_ERRORS.invalidDate],
    [{ ...VALID, eventDate: "holnap" }, PROGRAM_SUBMIT_ERRORS.invalidDate],
    [{ ...VALID, url: "javascript:alert(1)" }, PROGRAM_SUBMIT_ERRORS.invalidUrl],
    [{ ...VALID, url: "nem url" }, PROGRAM_SUBMIT_ERRORS.invalidUrl],
    [{ ...VALID, name: "x".repeat(201) }, PROGRAM_SUBMIT_ERRORS.tooLong],
    [{ ...VALID, description: "x".repeat(4001) }, PROGRAM_SUBMIT_ERRORS.tooLong],
  ];
  for (const [i, [input, err]] of bad.entries()) {
    test(`hibás #${i}`, async () => {
      const { d, calls } = deps();
      assert.deepEqual(await submitProgram(input, d), { ok: false, error: err });
      assert.equal(calls.rate + calls.inserts.length + calls.pushes.length, 0);
    });
  }
  test("validate: üres opcionális mezők NULL-ra", () => {
    const v = validateProgramInput(VALID);
    assert.ok(v.ok && v.value.url === null && v.value.contact === null);
  });
});

describe("bekötés (forrás-ellenőrzés)", () => {
  const form = readFileSync("app/programajanlok/ProgramForm.tsx", "utf8");
  const action = readFileSync("app/programajanlok/actions.ts", "utf8");
  test("a ProgramForm nem kér admin pusht és nem szúr be közvetlenül", () => {
    assert.doesNotMatch(form, /api\/push\/notify/);
    assert.doesNotMatch(form, /\.from\("programs"\)/);
    assert.match(form, /submitProgramAction\(\{ name, location, eventDate, description, url, contact \}\)/);
    assert.match(form, /Hiba történt a beküldés során\. Próbáld újra\./);
    assert.match(form, /Köszönjük a beküldést!/);
  });
  test("a server action: 'use server', meglévő limiter, felhasználói kliens (RLS), sendAdminPush", () => {
    assert.match(action, /^"use server";/);
    assert.match(action, /rateLimiter\.check\(/);
    assert.match(action, /from "@\/lib\/supabase\/server"/);
    assert.doesNotMatch(action, /createAdminClient/);
    assert.match(action, /notifyAdmins: sendAdminPush/);
  });
});
