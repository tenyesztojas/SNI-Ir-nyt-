// Védett Család — szülői push-feliratkozás: tiszta (függőségmentes) logika.

// Ki láthatja a „Gyermekem utazási értesítései” kártyát? Ugyanaz a feltétel,
// mint a claim_child_travel_notification() címzettjeinél: aktív owner, akinek
// van gyermeke, vagy aktív guardian, akinek aktív megtekintési/kezelési joga
// van egy, a családjához tartozó gyermekre. A bemenet KIZÁRÓLAG szerveroldali,
// RLS-szűrt lekérdezésből jön. (A tényleges címzést a küldéskor a DB dönti el.)
export function decideTravelNotificationEligibility(
  families: ReadonlyArray<{ myRole: string; children: ReadonlyArray<{ id: string }> }>,
  guardianPermittedChildIds: ReadonlyArray<string>
): boolean {
  if (families.some((f) => f.myRole === "owner" && f.children.length > 0)) return true;
  const permitted = new Set(guardianPermittedChildIds);
  return families.some((f) => f.myRole === "guardian" && f.children.some((c) => permitted.has(c.id)));
}

export function guardianChildIds(families: ReadonlyArray<{ myRole: string; children: ReadonlyArray<{ id: string }> }>): string[] {
  return Array.from(new Set(families.filter((f) => f.myRole === "guardian").flatMap((f) => f.children.map((c) => c.id))));
}

// Csak a szerver kifejezett { ok: true } válasza számít sikernek.
export function isPushApiSuccess(resOk: boolean, json: unknown): boolean {
  return resOk && !!json && typeof json === "object" && (json as { ok?: unknown }).ok === true;
}

export function isPushLinked(resOk: boolean, json: unknown): boolean {
  return isPushApiSuccess(resOk, json) && (json as { linked?: unknown }).linked === true;
}

// A végpont MÁS fiók nevén van (fiókváltás) — a kliens böngészőben bontja.
export function isPushStale(resOk: boolean, json: unknown): boolean {
  return isPushApiSuccess(resOk, json) && (json as { stale?: unknown }).stale === true;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type TravelPushUiStatus =
  | "checking"
  | "unsupported"
  | "native"
  | "no_vapid"
  | "sw_error"
  | "denied"
  | "off"
  | "on"
  | "busy";

export const TRAVEL_PUSH_CARD_TEXT = {
  title: "Gyermekem utazási értesítései",
  intro:
    "Ezen az eszközön értesítést kaphatsz, amikor a gyermeked az alkalmazásban jelzi, hogy elindult, megérkezett, vagy segítséget kér.",
  disclaimer:
    "Az értesítések kézbesítése nem garantált: késhetnek vagy elmaradhatnak (például kikapcsolt telefon, hálózati hiba vagy böngészőbeállítás miatt). Ez nem segélyhívó szolgáltatás — vészhelyzetben hívd a 112-t.",
  deviceNote: "A beállítás csak erre a böngészőre és a jelenleg bejelentkezett fiókra vonatkozik.",
  status: {
    checking: "Állapot ellenőrzése…",
    unsupported: "Ez a böngésző nem támogatja a push-értesítéseket.",
    native: "A mobilalkalmazásban ez még nem érhető el. Böngészőből (például telefonon a kezdőképernyőre tett webappból) kapcsolhatod be.",
    no_vapid: "Az értesítések jelenleg nem érhetők el (hiányzó szerverbeállítás).",
    sw_error: "Az értesítési szolgáltatás nem indult el ebben a böngészőben. Frissítsd az oldalt, és próbáld újra.",
    denied: "Az értesítések le vannak tiltva a böngésződben. A böngésző beállításaiban engedélyezheted őket.",
    off: "Kikapcsolva",
    on: "Bekapcsolva ezen az eszközön",
    busy: "Folyamatban…",
  } satisfies Record<TravelPushUiStatus, string>,
  saveError: "A beállítást nem sikerült menteni. Próbáld újra később.",
  turnOn: "Értesítések bekapcsolása",
  turnOff: "Értesítések kikapcsolása",
} as const;
