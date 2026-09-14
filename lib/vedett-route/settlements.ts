// Védett Útvonal — magyar település-adatforrás betöltése és a kész
// keresési index ("UX-fejlesztés..." kör, A) rész).
//
// ADATFORRÁS: data/hungarian-settlements.json — Magyarország településeinek
// { name, county } listája (a projektben ez az EGYETLEN magyar
// településlista — nincs párhuzamos adatforrás). Az adatfájl geonames.org
// alapú, közösségi (nem hivatalos KSH-) összeállításból származik — lásd a
// fájl elejéni megjegyzést a data/ mappában és a végső riport "ismert
// korlátok" pontját.
//
// Ez a modul KIZÁRÓLAG a kliens oldali (SettlementAutocomplete) és
// esetleges szerver oldali hívók számára ad egy KÉSZ, előre indexelt
// keresőt — a tényleges normalizálási/rangsorolási ALGORITMUS a
// settlementSearch.ts-ben él (lásd ott a fejléc-megjegyzést, miért van a
// kettő szétválasztva).
//
// FONTOS: ez a modul NEM végez semmilyen hálózati hívást, és NEM
// helyettesíti/nem érinti a meglévő koordináta-geokódolást (lásd
// lib/vedett-route/geocode.ts) — kizárólag településNÉV-azonosításra
// szolgál, a "Város" mező kitöltésének megkönnyítésére.
import settlementsData from "@/data/hungarian-settlements.json";
import {
  buildSettlementSearchIndex,
  searchSettlements as searchSettlementsInIndex,
  formatSettlementCountyLabel,
  type Settlement,
} from "./settlementSearch.ts";

export type { Settlement };
export { formatSettlementCountyLabel };

export const HUNGARIAN_SETTLEMENTS: Settlement[] = settlementsData as Settlement[];

const SETTLEMENT_SEARCH_INDEX = buildSettlementSearchIndex(HUNGARIAN_SETTLEMENTS);

export function searchHungarianSettlements(query: string): Settlement[] {
  return searchSettlementsInIndex(SETTLEMENT_SEARCH_INDEX, query);
}
