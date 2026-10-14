// VÉDETT CSALÁD — teljes gyermekutazási folyamat (EGYSÉG- és STATIKUS tesztek).
// Valódi Supabase/RLS integrációs teszt NINCS (tesztadatbázis hiányában);
// a jogosultsági pontok itt csak forráskód-szinten ellenőrzöttek.
//   node --test __tests__/family/travel-flow.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyTravelAction, availableActionsFor, carriedOverTrips, childTravelLabel, previousDate,
  resolveItemTravelState, type TravelState, type TravelStatusRow,
} from "../../lib/family/travelStatus.ts";
import { buildTravelCard } from "../../lib/family/travelCard.ts";
import { budapestLocalDay, todayDepartureAlerts, todayScheduleItems } from "../../lib/family/todaySchedule.ts";

const read = (p: string) => readFileSync(p, "utf8");
const item = (o: Record<string, unknown>) =>
  ({ id: "a", title: "Edzés", description: null, scheduleType: "recurring", startDate: null, endDate: null,
    timeLocal: "16:00", arrivalTimeLocal: "16:40", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], originLabel: "Otthon",
    originLat: 47.48, originLon: 19.01, destinationLabel: "Sportcsarnok", destinationLat: 47.5,
    destinationLon: 19.05, isActive: true, ...o }) as never;
const row = (o: Partial<TravelStatusRow>): TravelStatusRow => ({
  child_id: "c", schedule_item_id: "a", travel_date: "2026-10-14", status: "departed",
  departed_at: "t", arrived_at: null, help_requested_at: null, updated_at: "t", ...o,
});
const step = (s: TravelState | null, a: "depart" | "arrive" | "help", t: string) => {
  const r = applyTravelAction(s, a, t);
  assert.equal(r.ok, true);
  return (r as { ok: true; state: TravelState }).state;
};

describe("teljes folyamat (egység)", () => {
  test("napirend -> kártya + link -> figyelmeztetés -> indul -> segítség -> megérkezik", () => {
    const it = item({});
    const card = buildTravelCard(it);
    assert.equal(card.to, "Sportcsarnok");
    const q = new URLSearchParams(card.routeHref!.split("?")[1]);
    assert.deepEqual([q.get("lat"), q.get("originLat")], ["47.5", "47.48"]);
    assert.deepEqual(todayDepartureAlerts([it], new Date("2026-10-14T15:50:00+02:00")), [{ itemId: "a", level: "10", minutesLeft: 10 }]);
    let s = step(null, "depart", "T1");
    assert.equal(childTravelLabel(s), "Úton vagyok");
    s = step(s, "help", "T2");
    assert.equal(childTravelLabel(s), "Segítséget kértem");
    s = step(s, "arrive", "T3");
    assert.equal(childTravelLabel(s), "Megérkeztem");
    assert.equal(s.helpRequestedAt, "T2");
    assert.deepEqual(availableActionsFor(s, false), []);
    assert.equal(childTravelLabel(null), "Még nem indultam el");
  });
  test("ismételt kattintás nem hoz létre új utat és nem írja felül az időt", () => {
    const s = step(null, "depart", "T1");
    const r = applyTravelAction(s, "depart", "T2") as { ok: true; changed: boolean; state: TravelState };
    assert.equal(r.changed, false);
    assert.equal(r.state.departedAt, "T1");
  });
});

describe("napváltás és újratöltés", () => {
  test("újratöltés után a mai mentett állapot visszaáll", () => {
    assert.equal(resolveItemTravelState([row({ status: "help_requested" })], "a", "2026-10-14").state?.status, "help_requested");
  });
  test("másnap ugyanahhoz az ismétlődő programhoz új út indulhat (tegnapi lezárt nem hat)", () => {
    const r = resolveItemTravelState([row({ status: "arrived", arrived_at: "x" })], "a", "2026-10-15");
    assert.deepEqual(r, { state: null, carriedOver: false });
  });
  test("éjfélen átnyúló út: a tegnapi nyitott út folytatódik, új indulás nélkül", () => {
    const r = resolveItemTravelState([row({})], "a", "2026-10-15");
    assert.equal(r.carriedOver, true);
    assert.deepEqual(availableActionsFor(r.state, r.carriedOver), ["arrive", "help"]);
  });
  test("tegnapi nyitott út, amelynek programja ma nincs a listában, külön megjelenik", () => {
    assert.equal(carriedOverTrips([row({})], "2026-10-15", new Set()).length, 1);
    assert.equal(carriedOverTrips([row({})], "2026-10-15", new Set(["a"])).length, 0);
    assert.equal(carriedOverTrips([row({ status: "arrived" })], "2026-10-15", new Set()).length, 0);
  });
  test("dátum-léptetés hónap- és évhatáron", () => {
    assert.equal(previousDate("2027-01-01"), "2026-12-31");
    assert.equal(previousDate("2026-03-01"), "2026-02-28");
  });
});

describe("hiányzó / inaktív adatok", () => {
  test("hiányzó célkoordináta: nincs link; inaktív program nincs a napi listában", () => {
    assert.equal(buildTravelCard(item({ destinationLat: null, destinationLon: null })).routeHref, null);
    const day = budapestLocalDay(new Date("2026-10-14T10:00:00+02:00"));
    assert.equal(todayScheduleItems([item({ isActive: false })], day).length, 0);
  });
});

describe("statikus: hibakezelés és jogosultság", () => {
  test("nincs optimista állapot; elavult állapotnál szerveres újratöltés", () => {
    const c = read("components/family/TravelStatusControls.tsx");
    assert.match(c, /if \(res\.ok\) \{\s*setState\(res\.state\);/);
    assert.match(c, /catch \{\s*setMessage\(\{ kind: "error"/);
    assert.match(c, /res\.error === "travel_closed"[\s\S]{0,120}router\.refresh\(\)/);
    assert.match(c, /az alkalmazás nem követi, hol vagy/);
  });
  test("gyermekoldal: a page mai+tegnapi sorokat tölt a saját gyermekre", () => {
    const p = read("app/csalad/page.tsx");
    assert.match(p, /getChildTravelStatusesForDates\(childSelf\.id, \[today, previousDate\(today\)\]\)/);
  });
  test("API: nem ad vissza schedule_item_id-t; bejelentkezés kötelező", () => {
    const r = read("app/api/family/travel-status/route.ts");
    const out = r.slice(r.indexOf("statuses: Object.fromEntries("));
    assert.doesNotMatch(out, /schedule_item_id/);
    assert.match(r, /status: 401/);
  });
  test("szülői nézet: indulás, lezárás, saját visszajelzés jelölése", () => {
    const s = read("components/family/ChildTravelStatusSummary.tsx");
    assert.match(s, /Elindult: \{fmt\(status\.departed_at\)\}/);
    assert.match(s, /Az utazás lezárult – megérkezett/);
    assert.match(s, /nem helymeghatározáson alapulnak/);
  });
});
