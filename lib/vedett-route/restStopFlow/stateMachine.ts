// Sprint E — determinisztikus, tiszta (side-effect mentes) állapotgép a
// "Pihenőre van szükségem" folyamathoz.
//
// A Sprint E Preparation Gate hozta létre ezt a reducert; a Sprint E
// teljes implementációja EVOLVÁLTA (nem hozott létre párhuzamos második
// állapotgépet): bekerült a ROUTING_TO_REST_POINT köztes állapot (spec 2.
// pont) és a hibaágak mostantól a types.ts-ben definiált, zárt
// RestStopFlowErrorReason kódokat használják szabad szöveg helyett.
//
// SZÁNDÉKOS TERVEZÉSI DÖNTÉS: ez a reducer SOSEM hív hálózatot, SOSEM ír
// adatbázist, SOSEM importál React-et vagy UI-t — tisztán a
// (context, event) -> context leképezést végzi, pontosan úgy, mint a
// projekt már meglévő ranking.ts/sensoryEngine.ts pure function-jei.
// Ez teszi lehetővé, hogy élő route service vagy DB nélkül, unit
// tesztekkel 100%-ban lefedhető legyen minden állapotátmenet. A tényleges
// hálózati hívásokat (pihenőpont-keresés, route-service) a
// components/vedett-utvonal/RestStopFlowPanel.tsx orkesztrálja, és ennek a
// reducernek adja át az eredményt EVENT formájában.
//
// ÉRVÉNYTELEN átmenet esetén SOSEM dobunk kivételt — { ok: false,
// reason: "invalid_transition" }-t adunk vissza, a context VÁLTOZATLANUL
// (beleértve az originalDestination-t is, ami emiatt SOHA nem veszhet el
// egy hibás/váratlan esemény miatt sem).

import type { RestStopFlowContext, RestStopFlowEvent, RestStopFlowTransitionResult } from "./types.ts";

function invalid(context: RestStopFlowContext, event: RestStopFlowEvent): RestStopFlowTransitionResult {
  return {
    ok: false,
    reason: "invalid_transition",
    message: `Érvénytelen átmenet: "${event.type}" esemény a(z) "${context.state}" állapotban.`,
    context,
  };
}

// Azok az állapotok, amelyekből a felhasználó még "meggondolhatja magát"
// és egyszerűen visszatérhet a normál aktív útvonalhoz — azaz még NEM
// indult el fizikailag a pihenőpont felé. A ROUTING_TO_REST_POINT
// szándékosan idetartozik: ott még csak egy hálózati kérés fut, a
// felhasználó fizikailag nem mozdult.
const CANCELLABLE_STATES: RestStopFlowContext["state"][] = [
  "REST_REQUESTED",
  "REST_POINTS_LOADING",
  "REST_POINTS_READY",
  "REST_POINT_SELECTED",
  "ROUTING_TO_REST_POINT",
];

// A originalDestination és originalDepartAt MINDEN ágban egyszerűen
// átmásolódik (spread), SOHA nincs olyan ág, ami ezeket felülírná —
// ez a "readonly" típusjelölés + ez a reducer-tervezés együtt garantálja
// a "a pihenőpont sosem írja felül véglegesen az eredeti célt" szabályt.
export function transitionRestStopFlow(
  context: RestStopFlowContext,
  event: RestStopFlowEvent
): RestStopFlowTransitionResult {
  if (event.type === "CANCEL_REST_STOP") {
    if (!CANCELLABLE_STATES.includes(context.state)) return invalid(context, event);
    return {
      ok: true,
      context: {
        ...context,
        state: "ROUTE_ACTIVE",
        rankedRestPoints: undefined,
        selectedRestPoint: undefined,
        errorReason: undefined,
        errorMessage: undefined,
        expandedSearch: undefined,
        discoveryPartial: undefined,
        discoverySources: undefined,
      },
    };
  }

  if (event.type === "RESET_TO_ROUTE_ACTIVE") {
    if (context.state !== "ERROR") return invalid(context, event);
    return {
      ok: true,
      context: {
        ...context,
        state: "ROUTE_ACTIVE",
        rankedRestPoints: undefined,
        selectedRestPoint: undefined,
        errorReason: undefined,
        errorMessage: undefined,
        expandedSearch: undefined,
        discoveryPartial: undefined,
        discoverySources: undefined,
      },
    };
  }

  switch (context.state) {
    case "ROUTE_ACTIVE": {
      if (event.type === "REQUEST_REST") {
        return { ok: true, context: { ...context, state: "REST_REQUESTED" } };
      }
      return invalid(context, event);
    }

    case "REST_REQUESTED": {
      if (event.type === "START_LOADING_REST_POINTS") {
        return { ok: true, context: { ...context, state: "REST_POINTS_LOADING" } };
      }
      return invalid(context, event);
    }

    case "REST_POINTS_LOADING": {
      if (event.type === "REST_POINTS_LOADED") {
        return {
          ok: true,
          context: {
            ...context,
            state: "REST_POINTS_READY",
            rankedRestPoints: event.restPoints,
            expandedSearch: event.expandedSearch,
            discoveryPartial: event.discoveryPartial,
            discoverySources: event.sources,
          },
        };
      }
      if (event.type === "REST_POINTS_LOAD_FAILED") {
        return {
          ok: true,
          context: {
            ...context,
            state: "ERROR",
            errorReason: event.reason,
            errorMessage: event.message,
            discoverySources: event.sources,
          },
        };
      }
      return invalid(context, event);
    }

    case "REST_POINTS_READY": {
      if (event.type === "SELECT_REST_POINT") {
        return {
          ok: true,
          context: { ...context, state: "REST_POINT_SELECTED", selectedRestPoint: event.restPoint },
        };
      }
      return invalid(context, event);
    }

    case "REST_POINT_SELECTED": {
      if (event.type === "START_ROUTE_TO_REST_POINT") {
        if (!context.selectedRestPoint) {
          // Védekező ág — elvileg nem fordulhat elő (SELECT_REST_POINT
          // mindig kitölti), de SOHA nem engedünk útvonaltervezést
          // kezdeni kiválasztott pont nélkül.
          return invalid(context, event);
        }
        return { ok: true, context: { ...context, state: "ROUTING_TO_REST_POINT" } };
      }
      return invalid(context, event);
    }

    case "ROUTING_TO_REST_POINT": {
      if (event.type === "ROUTE_TO_REST_POINT_READY") {
        return { ok: true, context: { ...context, state: "NAVIGATING_TO_REST_POINT" } };
      }
      if (event.type === "ROUTE_TO_REST_POINT_FAILED") {
        return {
          ok: true,
          context: { ...context, state: "ERROR", errorReason: event.reason, errorMessage: event.message },
        };
      }
      return invalid(context, event);
    }

    case "NAVIGATING_TO_REST_POINT": {
      if (event.type === "ARRIVED_AT_REST_POINT") {
        return { ok: true, context: { ...context, state: "AT_REST_POINT" } };
      }
      return invalid(context, event);
    }

    case "AT_REST_POINT": {
      if (event.type === "REQUEST_RESUME") {
        return { ok: true, context: { ...context, state: "RESUME_REQUESTED" } };
      }
      return invalid(context, event);
    }

    case "RESUME_REQUESTED": {
      if (event.type === "START_REROUTE") {
        return { ok: true, context: { ...context, state: "REROUTING_TO_ORIGINAL_DESTINATION" } };
      }
      return invalid(context, event);
    }

    case "REROUTING_TO_ORIGINAL_DESTINATION": {
      if (event.type === "REROUTE_SUCCEEDED") {
        return { ok: true, context: { ...context, state: "ROUTE_RESUMED" } };
      }
      if (event.type === "REROUTE_FAILED") {
        return {
          ok: true,
          context: { ...context, state: "ERROR", errorReason: event.reason, errorMessage: event.message },
        };
      }
      return invalid(context, event);
    }

    case "ROUTE_RESUMED": {
      // Végállapot ebben a folyamatban — nincs innen kimenő átmenet
      // (egy ÚJ "Pihenőre van szükségem" kérés egy ÚJ context-et hozna
      // létre, nem ebből a végállapotból folytatná — lásd
      // createInitialRestStopFlowContext, amit a UI réteg hív újra).
      return invalid(context, event);
    }

    case "ERROR": {
      // ERROR-ból KIZÁRÓLAG a fent már kezelt RESET_TO_ROUTE_ACTIVE vezet
      // ki — minden más esemény érvénytelen.
      return invalid(context, event);
    }

    default:
      return invalid(context, event);
  }
}

export function createInitialRestStopFlowContext(
  originalDestination: RestStopFlowContext["originalDestination"],
  originalDepartAt: string
): RestStopFlowContext {
  return {
    state: "ROUTE_ACTIVE",
    originalDestination,
    originalDepartAt,
  };
}
