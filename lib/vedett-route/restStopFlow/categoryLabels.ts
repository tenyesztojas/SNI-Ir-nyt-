// Sprint E.1 — normalizált pihenőpont-kategóriák UI-címkéi és a
// gyorsszűrők definíciója.
//
// A címkék/emojik SZEMLÉLTETŐ jellegűek (spec 9. pont: "illusztratív,
// nem véglegesített dizájn") — a tényleges vizuális rendszernek (Tailwind
// osztályok, meglévő ikon-készlet, ha van) kell igazodniuk, ezt a modult
// könnyű később finomítani anélkül, hogy a discovery/ranking logikát
// érintené.
//
// A gyorsszűrők (spec 9. pont) KIZÁRÓLAG valós, a RestPoint típuson már
// létező mezőkön dolgoznak (seating/toilet/indoors/outdoors) — nem
// vezetünk be új, nem létező attribútumot csak a szűrő kedvéért.

import type { RestPoint, RestPointCategory } from "../../rest-points/types.ts";

export interface CategoryLabel {
  category: RestPointCategory;
  // Rövid magyar cím a kártyán/markeren.
  label: string;
  // Illusztratív emoji — lásd fenti fejléc.
  emoji: string;
}

export const CATEGORY_LABELS: Record<RestPointCategory, CategoryLabel> = {
  TOILET: { category: "TOILET", label: "Nyilvános mosdó", emoji: "🚻" },
  BENCH: { category: "BENCH", label: "Pad", emoji: "🪑" },
  PICNIC: { category: "PICNIC", label: "Piknikező hely", emoji: "🧺" },
  PARK: { category: "PARK", label: "Park", emoji: "🌳" },
  GARDEN: { category: "GARDEN", label: "Kert", emoji: "🌿" },
  SHELTER: { category: "SHELTER", label: "Fedett menedék", emoji: "🏠" },
  LIBRARY: { category: "LIBRARY", label: "Könyvtár", emoji: "📚" },
  COMMUNITY: { category: "COMMUNITY", label: "Közösségi tér", emoji: "🏛️" },
  USER: { category: "USER", label: "Saját pihenőpont", emoji: "📍" },
  VEDETT_SAROK: { category: "VEDETT_SAROK", label: "Védett Sarok", emoji: "💙" },
};

export function categoryLabelFor(restPoint: RestPoint): CategoryLabel {
  if (restPoint.category && CATEGORY_LABELS[restPoint.category]) {
    return CATEGORY_LABELS[restPoint.category];
  }
  // Additív mező hiányában (pl. a mapRestPointRow() útján olvasott sima
  // USER sor, lásd rest-points/types.ts fejléce) a forrás alapján esünk
  // vissza — ez SOSEM fabrikál kategóriát, csak a forrás-mezőt tükrözi.
  if (restPoint.source === "VEDETT_SAROK") return CATEGORY_LABELS.VEDETT_SAROK;
  return CATEGORY_LABELS.USER;
}

export type RestPointQuickFilterKey = "ALL" | "SEATING" | "TOILET" | "GREEN" | "INDOOR";

export interface RestPointQuickFilter {
  key: RestPointQuickFilterKey;
  label: string;
  // Ha undefined -> nincs szűrés (ez a "Mind" opció). A predikátum csak
  // TÉNYLEGESEN ismert (true) attribútumon szűr — null/false SOSEM
  // egyenértékű "nem felel meg"-gel automatikusan false-ra állítva
  // (lásd lent — a hiányzó adatú pontokat NEM zárjuk ki egy szűrőnél,
  // csak azokat, amikről TUDJUK, hogy nem felelnek meg).
  predicate?: (restPoint: RestPoint) => boolean;
}

export const REST_POINT_QUICK_FILTERS: RestPointQuickFilter[] = [
  { key: "ALL", label: "Mind" },
  { key: "SEATING", label: "Leülnék", predicate: (rp) => rp.seating === true },
  { key: "TOILET", label: "Mosdót keresek", predicate: (rp) => rp.toilet === true },
  {
    key: "GREEN",
    label: "Zöld hely",
    predicate: (rp) => rp.category === "PARK" || rp.category === "GARDEN",
  },
  { key: "INDOOR", label: "Beltéri, fedett hely", predicate: (rp) => rp.indoors === true },
];

export function applyRestPointQuickFilter(restPoints: RestPoint[], key: RestPointQuickFilterKey): RestPoint[] {
  const filter = REST_POINT_QUICK_FILTERS.find((f) => f.key === key);
  if (!filter?.predicate) return restPoints;
  return restPoints.filter(filter.predicate);
}
