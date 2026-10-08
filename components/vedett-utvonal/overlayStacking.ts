// LIVE ALTERNATIVE KÁRTYA ÁTFEDÉS-JAVÍTÁS (2026-10-08) — tiszta (React-mentes)
// elrendezés-számítás a navigációs overlay-ekhez.
//
// Root cause: a Live Alternative ajánlat-/előnézet-kártya fix
// `top-[4.25rem]` (68px) pozícióban ült, a turn-by-turn instrukciós kártya
// viszont a felső gombsor ALÁ (gombsor alja + 10px) mért pozícióban, UGYANAZZAL
// a z-20-szal és a DOM-ban KÉSŐBB — így az instrukciós kártya mindig
// rárajzolódott és eltakarta az ajánlatot és a gombjait.
//
// Megoldás: az ajánlat-kártya a MÉRT instrukciós kártya alá kerül (12px
// térköz); mérés hiányában a felső gombsor alá, végső esetben a korábbi 68px.
// A max-height a konténer magasságához igazodik (alul az ETA-kártyának
// fenntartott sávval), így kis képernyőn a kártya belső görgetéssel marad
// teljesen elérhető.

export const STACKED_OVERLAY_GAP_PX = 12;
/** A korábbi `top-[4.25rem]` érték — fallback, ha semmi nem mérhető. */
export const STACKED_OVERLAY_FALLBACK_TOP_PX = 68;
/** Alul fenntartott sáv (ETA-kártya, bottom-3 + magasság). */
export const STACKED_OVERLAY_BOTTOM_RESERVE_PX = 96;
/** Minimális látható magasság (belső görgetéssel). */
export const STACKED_OVERLAY_MIN_HEIGHT_PX = 112;

export function computeStackedOverlayLayout(input: {
  /** A felette lévő (instrukciós) kártya mért alja a konténerben, ha látszik. */
  anchorBottomPx: number | null;
  /** A felső gombsor mért alja, ha mérhető. */
  topActionBarBottomPx: number | null;
}): { top: string; maxHeight: string } {
  const candidates = [STACKED_OVERLAY_FALLBACK_TOP_PX];
  if (input.topActionBarBottomPx !== null && Number.isFinite(input.topActionBarBottomPx)) {
    candidates.push(input.topActionBarBottomPx + STACKED_OVERLAY_GAP_PX);
  }
  if (input.anchorBottomPx !== null && Number.isFinite(input.anchorBottomPx)) {
    candidates.push(input.anchorBottomPx + STACKED_OVERLAY_GAP_PX);
  }
  const topPx = Math.round(Math.max(...candidates));
  return {
    top: `${topPx}px`,
    maxHeight: `max(${STACKED_OVERLAY_MIN_HEIGHT_PX}px, calc(100% - ${topPx}px - ${STACKED_OVERLAY_BOTTOM_RESERVE_PX}px))`,
  };
}
