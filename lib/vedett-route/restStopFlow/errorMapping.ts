// Sprint E — MotisPlanResult -> RestStopFlowErrorReason leképezés.
//
// PURE függvény, nincs hálózati hívás — a lib/vedett-route/motisClient.ts
// fetchMotisPlan() már lezajlott hívásának EREDMÉNYÉT térképezi át a Sprint
// E spec 9. pontjában felsorolt, explicit hibakódokra. Ezt használja mind a
// route-to-rest-point, mind a resume (reroute) API route, hogy a leképezés
// logikája EGY helyen éljen és unit teszttel (hálózat nélkül) 100%-ban
// lefedhető legyen.
//
// SOHA nem szivárogtat infrastrukturális részletet (route service URL,
// nyers hibaüzenet) a felhasználó felé — a "message" mező mindig egy
// magyar, felhasználóbarát szöveg. A technikai részlet (status kód, MOTIS
// reason) a szerver logban marad (lásd motisClient.ts vedettRouteLog
// hívásai, amik ezt a függvényt megelőzően már lefutottak).

import type { MotisPlanResult } from "../motisTypes.ts";
import type { RestStopFlowErrorReason } from "./types.ts";

export interface RestStopRouteError {
  reason: RestStopFlowErrorReason;
  message: string;
}

// Csak akkor hívandó, ha a MotisPlanResult.ok === false (a hívó felelőssége
// leellenőrizni). Sikeres MotisPlanResult "üres itinerary lista" esetét ez
// a függvény NEM kezeli — azt lásd pickBestItinerary.ts (REST_POINT_NO_ROUTE
// akkor, ha nulla itinerary érkezett vissza egy egyébként sikeres válaszban).
export function mapMotisPlanFailureToRestStopError(result: Extract<MotisPlanResult, { ok: false }>): RestStopRouteError {
  if (result.reason === "timeout") {
    return {
      reason: "ROUTE_SERVICE_TIMEOUT",
      message: "Az útvonaltervezés túl sokáig tartott. Próbáld újra.",
    };
  }

  if (result.reason === "routing_engine_unavailable") {
    return {
      reason: "ROUTE_SERVICE_UNAVAILABLE",
      message: "Az útvonaltervezés jelenleg nem érhető el.",
    };
  }

  // reason === "routing_error" — vagy egy HTTP hibaválasz (esetleg 401/403
  // auth hiba), vagy egy 200 OK, de nem-JSON (malformed) válasz. A
  // motisClient.ts mindkettőt "routing_error"-ként adja vissza, a status
  // mezővel — itt választjuk szét a kettőt.
  if (result.status === 401 || result.status === 403) {
    return {
      reason: "ROUTE_SERVICE_AUTH_FAILURE",
      message: "Az útvonaltervezés jelenleg nem érhető el (hitelesítési hiba).",
    };
  }

  return {
    reason: "MALFORMED_ROUTE_RESPONSE",
    message: "A routing motor hibás vagy váratlan választ adott.",
  };
}
