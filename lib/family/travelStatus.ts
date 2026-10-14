// Védett Család — gyermek utazási állapot (pure, tesztelhető).
// A szerveroldali igazság a set_child_travel_status() RPC
// (supabase/migrations/20261014_child_travel_status.sql); ez a modul annak
// átmeneti szabályait tükrözi, és a felületi szövegeket adja.

export type TravelAction = "depart" | "arrive" | "help";
export type TravelStatus = "departed" | "arrived" | "help_requested";
export type TravelErrorCode =
  | "travel_not_child"
  | "travel_item_not_found"
  | "travel_not_today"
  | "travel_closed"
  | "travel_not_departed"
  | "travel_invalid_action"
  | "travel_unknown";

export type TravelState = {
  status: TravelStatus;
  departedAt: string | null;
  arrivedAt: string | null;
  helpRequestedAt: string | null;
  updatedAt: string;
};

export const TRAVEL_ACTIONS: readonly TravelAction[] = ["depart", "arrive", "help"];

export function isTravelAction(v: unknown): v is TravelAction {
  return typeof v === "string" && (TRAVEL_ACTIONS as readonly string[]).includes(v);
}

export type TravelResult =
  | { ok: true; state: TravelState; changed: boolean }
  | { ok: false; error: TravelErrorCode };

export function applyTravelAction(cur: TravelState | null, action: TravelAction, nowIso: string): TravelResult {
  if (!cur) {
    if (action === "arrive") return { ok: false, error: "travel_not_departed" };
    return {
      ok: true,
      changed: true,
      state: {
        status: action === "help" ? "help_requested" : "departed",
        departedAt: action === "depart" ? nowIso : null,
        arrivedAt: null,
        helpRequestedAt: action === "help" ? nowIso : null,
        updatedAt: nowIso,
      },
    };
  }
  if (cur.status === "arrived") return { ok: false, error: "travel_closed" };
  if (action === "depart") {
    if (cur.departedAt) return { ok: true, changed: false, state: cur };
    return { ok: true, changed: true, state: { ...cur, departedAt: nowIso, updatedAt: nowIso } };
  }
  if (action === "arrive") {
    return { ok: true, changed: true, state: { ...cur, status: "arrived", arrivedAt: nowIso, updatedAt: nowIso } };
  }
  if (cur.status === "help_requested") return { ok: true, changed: false, state: cur };
  return { ok: true, changed: true, state: { ...cur, status: "help_requested", helpRequestedAt: nowIso, updatedAt: nowIso } };
}

// Mely gombok érhetők el egy adott állapotban (gyermekoldal).
export function availableTravelActions(cur: TravelState | null): TravelAction[] {
  if (!cur) return ["depart", "help"];
  if (cur.status === "arrived") return [];
  if (cur.status === "departed") return ["arrive", "help"];
  return cur.departedAt ? ["arrive"] : ["depart", "arrive"];
}

export function travelErrorCode(message: string | null | undefined): TravelErrorCode {
  const m = message ?? "";
  for (const code of [
    "travel_not_child",
    "travel_item_not_found",
    "travel_not_today",
    "travel_closed",
    "travel_not_departed",
    "travel_invalid_action",
  ] as const) {
    if (m.includes(code)) return code;
  }
  return "travel_unknown";
}

export const TRAVEL_ERROR_TEXT: Record<TravelErrorCode, string> = {
  travel_not_child: "Ezt csak a saját gyermekfiókodból jelezheted.",
  travel_item_not_found: "Ez a program nem található vagy nem aktív.",
  travel_not_today: "Ez a program ma nincs a napirendedben.",
  travel_closed: "Ez az utazás már lezárult (megérkeztél).",
  travel_not_departed: "Előbb jelezd, hogy elindultál.",
  travel_invalid_action: "Érvénytelen művelet.",
  travel_unknown: "Nem sikerült menteni. Próbáld újra egy kicsit később.",
};

export const TRAVEL_STATUS_LABEL: Record<TravelStatus, string> = {
  departed: "Elindult",
  arrived: "Megérkezett",
  help_requested: "Segítséget kér",
};

export const TRAVEL_ACTION_LABEL: Record<TravelAction, string> = {
  depart: "Elindultam",
  arrive: "Megérkeztem",
  help: "Segítséget kérek",
};

export const TRAVEL_ACTION_SUCCESS: Record<TravelAction, string> = {
  depart: "Rögzítettük: elindultál.",
  arrive: "Rögzítettük: megérkeztél. Az utazás lezárult.",
  help: "Rögzítettük a segítségkérést. A családod a Védett Család oldalon látja. Ez nem segélyhívás – vészhelyzetben hívd a 112-t.",
};

export type TravelStatusRow = {
  child_id: string;
  schedule_item_id: string;
  travel_date: string;
  status: TravelStatus;
  departed_at: string | null;
  arrived_at: string | null;
  help_requested_at: string | null;
  updated_at: string;
};

export function rowToTravelState(r: TravelStatusRow): TravelState {
  return {
    status: r.status,
    departedAt: r.departed_at,
    arrivedAt: r.arrived_at,
    helpRequestedAt: r.help_requested_at,
    updatedAt: r.updated_at,
  };
}

// Gyermekenként a legfrissebb (updated_at) sor.
export function latestTravelByChild<T extends { child_id: string; updated_at: string }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const prev = out.get(r.child_id);
    if (!prev || r.updated_at > prev.updated_at) out.set(r.child_id, r);
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ?children=<uuid>,<uuid> — max 50, csak érvényes UUID; egyébként null.
export function parseChildIds(raw: string | null): string[] | null {
  if (!raw) return null;
  const ids = Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)));
  if (ids.length === 0 || ids.length > 50 || !ids.every((id) => UUID_RE.test(id))) return null;
  return ids;
}

// ---- Gyermekoldali állapot-feloldás (integráció, 2026-10-14) ----
// A szerver (set_child_travel_status) sorválasztásának tükre: elsőbbsége a
// MAI sornak van; ha nincs, a TEGNAPI, még NYITOTT (nem arrived) sor
// folytatódik (éjfélen átnyúló út). Lezárt tegnapi út nem hat a mai napra.

export function previousDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function resolveItemTravelState(
  rows: TravelStatusRow[],
  itemId: string,
  date: string
): { state: TravelState | null; carriedOver: boolean } {
  const today = rows.find((r) => r.schedule_item_id === itemId && r.travel_date === date);
  if (today) return { state: rowToTravelState(today), carriedOver: false };
  const prev = previousDate(date);
  const open = rows.find((r) => r.schedule_item_id === itemId && r.travel_date === prev && r.status !== "arrived");
  return open ? { state: rowToTravelState(open), carriedOver: true } : { state: null, carriedOver: false };
}

// Tegnapról nyitva maradt utak, amelyek programja ma NINCS a listában.
export function carriedOverTrips(rows: TravelStatusRow[], date: string, listedItemIds: ReadonlySet<string>): TravelStatusRow[] {
  const prev = previousDate(date);
  return rows.filter(
    (r) =>
      r.travel_date === prev &&
      r.status !== "arrived" &&
      !listedItemIds.has(r.schedule_item_id) &&
      !rows.some((t) => t.schedule_item_id === r.schedule_item_id && t.travel_date === date)
  );
}

// Folytatott (tegnapi) útnál új indulás nem kezdhető ugyanazzal a sorral.
export function availableActionsFor(state: TravelState | null, carriedOver: boolean): TravelAction[] {
  const actions = availableTravelActions(state);
  return carriedOver ? actions.filter((a) => a !== "depart") : actions;
}

// A gyermek SAJÁT visszajelzése — nem helymeghatározás, nem ellenőrzött érkezés.
export function childTravelLabel(state: TravelState | null): string {
  if (!state) return "Még nem indultam el";
  if (state.status === "arrived") return "Megérkeztem";
  if (state.status === "help_requested") return "Segítséget kértem";
  return "Úton vagyok";
}
