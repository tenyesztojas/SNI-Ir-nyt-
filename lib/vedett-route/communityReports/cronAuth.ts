// Vercel Cron hitelesítés — FAIL-CLOSED: hiányzó / túl rövid CRON_SECRET esetén
// minden kérés elutasítva; időzítés-független összehasonlítás.
import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
