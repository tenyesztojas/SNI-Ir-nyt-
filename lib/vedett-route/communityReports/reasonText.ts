// VÉDETT ÚTVONAL — rangsorolási indokkódok -> rövid magyar UI-szöveg.
//
// Az engine csak kódot ad (szabad szöveg nincs); a fordítás itt van. A kártyán
// legfeljebb 2 KÖZÖSSÉGI indok jelenik meg — a strukturális indokokat
// (átszállás, gyaloglás, metró) a meglévő címkék már megmutatják, nem
// duplikáljuk. Historikus ("Ilyenkor általában…") kódot az engine csak
// usable/strong adatminőségnél ad. Számot, százalékot, mintaszámot nem mutatunk.

import type { RankingReasonCode } from "./communityRouting.ts";

export const COMMUNITY_REASON_TEXT: Partial<Record<RankingReasonCode, { text: string; tone: "positive" | "caution" }>> = {
  AVOIDS_REPORTED_DISRUPTION: { text: "Elkerüli a jelzett fennakadást", tone: "positive" },
  CURRENTLY_CALMER: { text: "Friss jelzések szerint nyugodtabb", tone: "positive" },
  LOWER_EXPECTED_CROWDING: { text: "Ilyenkor általában kevésbé zsúfolt", tone: "positive" },
  LOWER_EXPECTED_SENSORY_LOAD: { text: "Várhatóan nyugodtabb", tone: "positive" },
  TRAFFIC_DISRUPTION_REPORTED: { text: "Fennakadást jeleztek rajta", tone: "caution" },
  CURRENTLY_BUSIER: { text: "Friss közösségi jelzés alapján terheltebb", tone: "caution" },
  USUALLY_MORE_CROWDED: { text: "Ilyenkor általában zsúfoltabb", tone: "caution" },
};

const PRIORITY: RankingReasonCode[] = [
  "AVOIDS_REPORTED_DISRUPTION",
  "TRAFFIC_DISRUPTION_REPORTED",
  "CURRENTLY_CALMER",
  "CURRENTLY_BUSIER",
  "LOWER_EXPECTED_CROWDING",
  "USUALLY_MORE_CROWDED",
  "LOWER_EXPECTED_SENSORY_LOAD",
];

export function selectCommunityReasonChips(codes: readonly RankingReasonCode[] | undefined, max = 2): { code: RankingReasonCode; text: string; tone: "positive" | "caution" }[] {
  if (!codes || codes.length === 0) return [];
  return PRIORITY.filter((code) => codes.includes(code))
    .slice(0, max)
    .map((code) => ({ code, ...COMMUNITY_REASON_TEXT[code]! }));
}
