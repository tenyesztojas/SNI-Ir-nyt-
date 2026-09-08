// Sprint E — mapMotisPlanFailureToRestStopError tesztek.
// PURE, nincs hálózati hívás — a motisClient.ts fetchMotisPlan() már
// lezajlott (lásd __tests__/vedett-route/motisClient.test.ts a hálózati
// réteg saját tesztjeiért) eredményének leképezését teszteli.
//   node --test __tests__/vedett-route/rest-stop-error-mapping.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMotisPlanFailureToRestStopError } from "../../lib/vedett-route/restStopFlow/errorMapping.ts";
import type { MotisPlanResult } from "../../lib/vedett-route/motisTypes.ts";

function failure(partial: Partial<Extract<MotisPlanResult, { ok: false }>>): Extract<MotisPlanResult, { ok: false }> {
  return { ok: false, reason: "routing_error", message: "x", ...partial } as Extract<MotisPlanResult, { ok: false }>;
}

test("timeout -> ROUTE_SERVICE_TIMEOUT", () => {
  const mapped = mapMotisPlanFailureToRestStopError(failure({ reason: "timeout" }));
  assert.equal(mapped.reason, "ROUTE_SERVICE_TIMEOUT");
});

test("routing_engine_unavailable -> ROUTE_SERVICE_UNAVAILABLE", () => {
  const mapped = mapMotisPlanFailureToRestStopError(failure({ reason: "routing_engine_unavailable" }));
  assert.equal(mapped.reason, "ROUTE_SERVICE_UNAVAILABLE");
});

test("routing_error + status 401 -> ROUTE_SERVICE_AUTH_FAILURE", () => {
  const mapped = mapMotisPlanFailureToRestStopError(failure({ reason: "routing_error", status: 401 }));
  assert.equal(mapped.reason, "ROUTE_SERVICE_AUTH_FAILURE");
});

test("routing_error + status 403 -> ROUTE_SERVICE_AUTH_FAILURE", () => {
  const mapped = mapMotisPlanFailureToRestStopError(failure({ reason: "routing_error", status: 403 }));
  assert.equal(mapped.reason, "ROUTE_SERVICE_AUTH_FAILURE");
});

test("routing_error + status 500 (vagy hiányzó status) -> MALFORMED_ROUTE_RESPONSE", () => {
  const mapped = mapMotisPlanFailureToRestStopError(failure({ reason: "routing_error", status: 500 }));
  assert.equal(mapped.reason, "MALFORMED_ROUTE_RESPONSE");
  const mappedNoStatus = mapMotisPlanFailureToRestStopError(failure({ reason: "routing_error" }));
  assert.equal(mappedNoStatus.reason, "MALFORMED_ROUTE_RESPONSE");
});

test("a message mező sosem tartalmaz infrastrukturális részletet (URL, nyers hibaszöveg)", () => {
  for (const reason of ["timeout", "routing_engine_unavailable", "routing_error"] as const) {
    const mapped = mapMotisPlanFailureToRestStopError(failure({ reason }));
    assert.doesNotMatch(mapped.message, /https?:\/\//);
    assert.doesNotMatch(mapped.message, /route\.vedettsarok/i);
  }
});
