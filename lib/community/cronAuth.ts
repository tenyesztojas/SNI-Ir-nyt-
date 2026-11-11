// Közösségi cleanup cron hitelesítése — FAIL-CLOSED (2026-11-09).
// Hiányzó vagy üres CRON_SECRET esetén MINDEN hívás elutasítva. Korábban a
// route korábbi „authHeader !== Bearer + CRON_SECRET” feltétele
// hiányzó titoknál a „Bearer undefined” fejlécet elfogadta.
// Időzítés-független összehasonlítás. (A titok hosszára itt nincs minimum,
// hogy a meglévő éles beállítás ne törjön.)
import { timingSafeEqual } from "node:crypto";

export function isCleanupCronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
