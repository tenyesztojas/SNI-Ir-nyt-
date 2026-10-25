// Regresszió: A felhasználó NEM törölheti / veheti át B push-feliratkozását
// pusztán B végpontjának beküldésével (kijelentkezés, sync, subscribe).
//   node --test --experimental-strip-types __tests__/family/push-ownership.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { detachOwnPushSubscription, needsSignOutPushWarning, type SignOutPushStore } from "../../lib/pushSignOut.ts";
import { classifySyncOwner, decideSubscribeWrite } from "../../lib/pushSubscription.ts";

type Row = { endpoint: string; user_id: string | null };
const EP_A = "https://push.example/a";
const EP_B = "https://push.example/b";

function memStore(rows: Row[], opts: { deleteError?: boolean; readError?: boolean } = {}): SignOutPushStore & { rows: Row[] } {
  return {
    rows,
    async deleteOwn(endpoint, userId) {
      if (opts.deleteError) return { error: { code: "XX" } };
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].endpoint === endpoint && rows[i].user_id === userId) rows.splice(i, 1);
      return { error: null };
    },
    async endpointStillBound(endpoint) {
      if (opts.readError) return null;
      return rows.some((r) => r.endpoint === endpoint);
    },
  };
}

describe("kijelentkezés: csak a saját sor törölhető", () => {
  test("A beküldi B végpontját -> B sora megmarad, nincs hamis siker", async () => {
    const store = memStore([{ endpoint: EP_B, user_id: "B" }, { endpoint: EP_A, user_id: "A" }]);
    const r = await detachOwnPushSubscription(store, "A", EP_B);
    assert.equal(r, "failed");
    assert.deepEqual(store.rows, [{ endpoint: EP_B, user_id: "B" }, { endpoint: EP_A, user_id: "A" }]);
    // a kliens ilyenkor böngészőben bont; ha az sem sikerül, figyelmeztet
    assert.equal(needsSignOutPushWarning({ serverDetached: false, browserSubscriptionRemains: true }), true);
  });
  test("A saját végpontja törlődik, más eszköze és B sora marad", async () => {
    const store = memStore([{ endpoint: EP_A, user_id: "A" }, { endpoint: "https://push.example/a2", user_id: "A" }, { endpoint: EP_B, user_id: "B" }]);
    assert.equal(await detachOwnPushSubscription(store, "A", EP_A), "detached");
    assert.deepEqual(store.rows.map((r) => r.endpoint), ["https://push.example/a2", EP_B]);
  });
  test("tulajdonos nélküli (null) sor sem törölhető beküldött végponttal", async () => {
    const store = memStore([{ endpoint: EP_B, user_id: null }]);
    assert.equal(await detachOwnPushSubscription(store, "A", EP_B), "failed");
    assert.equal(store.rows.length, 1);
  });
  test("session nélkül / végpont nélkül semmi; hiba -> failed", async () => {
    const store = memStore([{ endpoint: EP_B, user_id: "B" }]);
    assert.equal(await detachOwnPushSubscription(store, null, EP_B), "none");
    assert.equal(await detachOwnPushSubscription(store, "A", null), "none");
    assert.equal(store.rows.length, 1);
    assert.equal(await detachOwnPushSubscription(memStore([{ endpoint: EP_A, user_id: "A" }], { deleteError: true }), "A", EP_A), "failed");
    assert.equal(await detachOwnPushSubscription(memStore([{ endpoint: EP_A, user_id: "A" }], { readError: true }), "A", EP_A), "failed");
  });
});

describe("subscribe / sync: nincs átvétel, nincs idegen törlés", () => {
  test("subscribe: B sorára beküldött végpont -> conflict (nem írja át)", () => {
    assert.equal(decideSubscribeWrite(["B"], "A"), "conflict");
    assert.equal(decideSubscribeWrite([null], "A"), "conflict");
    assert.equal(decideSubscribeWrite(["A"], "A"), "update");
    assert.equal(decideSubscribeWrite([], "A"), "insert");
  });
  test("sync: B sora -> stale (kliens bont), nem linked", () => {
    assert.deepEqual(classifySyncOwner(["B"], "A"), { linked: false, stale: true });
    assert.deepEqual(classifySyncOwner(["A"], "A"), { linked: true, stale: false });
    assert.deepEqual(classifySyncOwner([], "A"), { linked: false, stale: false });
  });
});
