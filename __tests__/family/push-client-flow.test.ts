// Regresszió: admin push-gomb / családi kártya — csak igazolt siker számít,
// 409-nél a régi böngészős feliratkozás bontása + egy új, idegen sor érintetlen.
//   node --test --experimental-strip-types __tests__/family/push-client-flow.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { subscribeAndSave, syncPushSubscription, unsubscribeAndDelete, type PushFlowDeps, type PushSubLike } from "../../lib/pushClientFlow.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function fake(opts: {
  existing?: string | null;
  responses: Array<{ ok: boolean; status?: number; json: unknown }>;
  unsubscribeOk?: boolean;
}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const unsubscribed: string[] = [];
  let n = 0;
  const mk = (endpoint: string): PushSubLike => ({
    endpoint,
    toJSON: () => ({ endpoint }),
    unsubscribe: async () => {
      unsubscribed.push(endpoint);
      return opts.unsubscribeOk ?? true;
    },
  });
  let current: PushSubLike | null = opts.existing ? mk(opts.existing) : null;
  const deps: PushFlowDeps = {
    getSubscription: async () => current,
    subscribe: async () => (current = mk(`https://push.example/new${++n}`)),
    post: async (url, method, body) => {
      calls.push({ url, method, body });
      return opts.responses.shift() ?? { ok: false, status: 500, json: null };
    },
  };
  return { deps, calls, unsubscribed };
}

const OK = { ok: true, status: 200, json: { ok: true } };
const CONFLICT = { ok: false, status: 409, json: { ok: false, error: "Endpoint in use" } };

describe("subscribeAndSave", () => {
  test("409: régi böngészős feliratkozás bontva, új végpont mentve -> igazolt siker", async () => {
    const f = fake({ existing: "https://push.example/old-B", responses: [CONFLICT, OK] });
    assert.equal(await subscribeAndSave(f.deps), true);
    assert.deepEqual(f.unsubscribed, ["https://push.example/old-B"]);
    assert.deepEqual(f.calls.map((c) => [c.url, c.method]), [["/api/push/subscribe", "POST"], ["/api/push/subscribe", "POST"]]);
    assert.deepEqual(f.calls[1].body, { endpoint: "https://push.example/new1" });
    // a kliens soha nem kér szerveroldali törlést más végpontra
    assert.ok(!f.calls.some((c) => c.method === "DELETE"));
  });
  test("409 ismét -> nincs hamis siker, nincs végtelen ciklus", async () => {
    const f = fake({ existing: "https://push.example/old-B", responses: [CONFLICT, CONFLICT] });
    assert.equal(await subscribeAndSave(f.deps), false);
    assert.equal(f.calls.length, 2);
  });
  test("409 és a böngészős bontás sikertelen -> false, nincs újrapróbálás", async () => {
    const f = fake({ existing: "https://push.example/old-B", responses: [CONFLICT], unsubscribeOk: false });
    assert.equal(await subscribeAndSave(f.deps), false);
    assert.equal(f.calls.length, 1);
  });
  test("500 / ok:false / hálózati hiba -> false", async () => {
    for (const r of [{ ok: false, status: 500, json: { ok: false } }, { ok: true, status: 200, json: { ok: false } }, { ok: true, status: 200, json: null }, { ok: false, status: 0, json: null }]) {
      const f = fake({ responses: [r] });
      assert.equal(await subscribeAndSave(f.deps), false, JSON.stringify(r));
    }
  });
});

describe("syncPushSubscription (betöltéskori állapot)", () => {
  test("csak linked:true -> on; stale -> böngészős bontás, off; hiba -> error", async () => {
    let f = fake({ existing: "https://push.example/x", responses: [{ ok: true, json: { ok: true, linked: true, stale: false } }] });
    assert.equal(await syncPushSubscription(f.deps), "on");
    f = fake({ existing: "https://push.example/x", responses: [{ ok: true, json: { ok: true, linked: false, stale: true } }] });
    assert.equal(await syncPushSubscription(f.deps), "off");
    assert.deepEqual(f.unsubscribed, ["https://push.example/x"]);
    f = fake({ existing: "https://push.example/x", responses: [{ ok: false, status: 500, json: null }] });
    assert.equal(await syncPushSubscription(f.deps), "error");
    f = fake({ responses: [] });
    assert.equal(await syncPushSubscription(f.deps), "off");
  });
});

describe("unsubscribeAndDelete", () => {
  test("szerverhiba -> false, a böngészős feliratkozás megmarad", async () => {
    const f = fake({ existing: "https://push.example/x", responses: [{ ok: false, status: 500, json: { ok: false } }] });
    assert.equal(await unsubscribeAndDelete(f.deps), false);
    assert.deepEqual(f.unsubscribed, []);
  });
  test("siker -> szerver törlés után böngészős bontás", async () => {
    const f = fake({ existing: "https://push.example/x", responses: [OK] });
    assert.equal(await unsubscribeAndDelete(f.deps), true);
    assert.deepEqual(f.unsubscribed, ["https://push.example/x"]);
  });
});

describe("admin PushNotifButton bekötés", () => {
  const b = read("components/PushNotifButton.tsx");
  test("igazolt siker nélkül nincs „subscribed”; hibaüzenet látható", () => {
    assert.match(b, /if \(await subscribeAndSave\(flowDeps\(reg\)\)\) \{\s*setStatus\("subscribed"\);\s*\} else \{\s*setError\(/);
    assert.match(b, /if \(await unsubscribeAndDelete\(flowDeps\(reg\)\)\) \{\s*setStatus\("unsubscribed"\);\s*\} else \{\s*setError\(/);
    assert.match(b, /const state = await syncPushSubscription\(flowDeps\(reg\)\);/);
    assert.match(b, /setStatus\(state === "on" \? "subscribed" : "unsubscribed"\)/);
    assert.match(b, /role="alert"/);
    assert.doesNotMatch(b, /setStatus\(sub \? "subscribed"/);
  });
  test("admin szövegek és felület változatlan", () => {
    for (const t of ["Push értesítések (PWA)", "Értesítést kapsz minden új hely- és programbeküldésről.", "Kikapcsol", "Bekapcsol", "Letiltva"]) {
      assert.ok(b.includes(t), t);
    }
  });
});
