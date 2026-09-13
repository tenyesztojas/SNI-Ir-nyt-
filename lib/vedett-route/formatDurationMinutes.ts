// lib/vedett-route/formatDurationMinutes.ts
//
// Tiszta, mellékhatás-mentes segédfüggvény az utazási idő formázásához
// magyar megjelenítésre (UI-ban: totalDurationMinutes, leg.durationMinutes,
// walkingMinutes, waitingMinutes). Routing/rangsorolást NEM érinti.
//
// Spec (2026-09-12):
//   0 → "0 perc"
//   1 → "1 perc"
//   59 → "59 perc"
//   60 → "1 óra"           (NEM "1 óra 0 perc")
//   61 → "1 óra 1 perc"
//   83 → "1 óra 23 perc"
//   120 → "2 óra"          (NEM "2 óra 0 perc")
//   121 → "2 óra 1 perc"
//   267 → "4 óra 27 perc"
//
// INVARIÁNS: ha a percrész 0, SOHA nem jelenik meg "X óra 0 perc" —
// csak "X óra". Ez megakadályozza a vizuálisan csúnya "2 óra 0 perc"
// formátumot. Node.js tesztekben futtatható React-függőség nélkül.

/**
 * Percek számát magyar szöveges formátumra alakítja:
 *   - csak percek (0–59): "N perc"
 *   - egész óra (percrész = 0): "N óra"
 *   - óra + perc: "N óra M perc"
 *
 * NEM produkál "N óra 0 perc" alakot.
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;

  if (hours === 0) {
    return `${minutes} perc`;
  }
  if (minutes === 0) {
    return `${hours} óra`;
  }
  return `${hours} óra ${minutes} perc`;
}
