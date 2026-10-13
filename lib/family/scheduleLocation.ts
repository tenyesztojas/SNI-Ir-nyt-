// VÉDETT CSALÁD — napirendi helyszínek koordinátái + Védett Útvonal mélylink
// (2026-10-12). Pure segédfüggvények: koordinátát SOHA nem találnak ki — csak
// a címkeresőből ténylegesen kiválasztott hely koordinátája kerül mentésre,
// és a "Útvonal megtervezése" link csak érvényes célkoordinátával aktív.

export type CoordinatePairResult =
  | { ok: true; lat: number | null; lon: number | null }
  | { ok: false; error: string };

/** Űrlapmezők -> koordinátapár. Mindkettő üres: nincs koordináta; fél pár vagy tartományon kívüli érték: hiba. */
export function parseCoordinatePair(latRaw: unknown, lonRaw: unknown): CoordinatePairResult {
  const latStr = typeof latRaw === "string" ? latRaw.trim() : "";
  const lonStr = typeof lonRaw === "string" ? lonRaw.trim() : "";
  if (!latStr && !lonStr) return { ok: true, lat: null, lon: null };
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!latStr || !lonStr || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ok: false, error: "Érvénytelen helyszín-koordináta. Válaszd ki újra a helyet a javaslatok közül." };
  }
  return { ok: true, lat, lon };
}

export function hasValidCoordinates(lat: number | null | undefined, lon: number | null | undefined): boolean {
  return (
    typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

/** A Védett Útvonal meglévő ?name=&lat=&lon= mélylinkje, vagy null (nincs érvényes célkoordináta). */
export function buildScheduleRouteHref(item: {
  title: string;
  destinationLabel: string | null;
  destinationLat: number | null;
  destinationLon: number | null;
  originLabel?: string | null;
  originLat?: number | null;
  originLon?: number | null;
}): string | null {
  if (!hasValidCoordinates(item.destinationLat, item.destinationLon)) return null;
  const name = (item.destinationLabel?.trim() || item.title.trim()).slice(0, 200);
  if (!name) return null;
  const params = new URLSearchParams({
    name,
    lat: String(item.destinationLat),
    lon: String(item.destinationLon),
  });
  // Kiindulási hely: KÜLÖN originName/originLat/originLon paraméterek, csak
  // érvényes koordinátával és névvel — egyébként a cél-mélylink változatlan.
  const originName = (item.originLabel ?? "").trim().slice(0, 200);
  if (originName && hasValidCoordinates(item.originLat ?? null, item.originLon ?? null)) {
    params.set("originName", originName);
    params.set("originLat", String(item.originLat));
    params.set("originLon", String(item.originLon));
  }
  return `/vedett-utvonal?${params.toString()}`;
}
