// Védett Család — családi létszám (gyermekek / felnőtt családtagok) megjelenítési
// modellje. A korlátot a DB kényszeríti ki (20261030000000: triggerek +
// családonkénti advisory lock); ez a modul csak a get_family_capacity()
// szerveroldali eredményét értelmezi és magyar szöveggé alakítja.
// Kliensből kapott érték SOHA nem bemenet.

export const FAMILY_FREE_LIMITS = { children: 1, adults: 2 } as const;
export const FAMILY_PLUS_LIMITS = { children: 10, adults: 10 } as const;

// A DB hint-kódjai (raise ... using hint = ...).
export const FAMILY_LIMIT_ERROR_CODES = ["family_child_limit_reached", "family_guardian_limit_reached"] as const;
export type FamilyLimitErrorCode = (typeof FAMILY_LIMIT_ERROR_CODES)[number];

export interface FamilyCapacity {
  childrenUsed: number;
  childrenLimit: number;
  adultsUsed: number;
  adultsLimit: number;
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

// Szigorú értelmezés: bármilyen eltérés -> null (a felület ilyenkor nem mutat létszámot).
export function parseFamilyCapacity(raw: unknown): FamilyCapacity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.children_used) || !isCount(r.children_limit) || !isCount(r.adults_used) || !isCount(r.adults_limit)) return null;
  if (r.children_limit < 1 || r.adults_limit < 1) return null;
  return {
    childrenUsed: r.children_used,
    childrenLimit: r.children_limit,
    adultsUsed: r.adults_used,
    adultsLimit: r.adults_limit,
  };
}

export interface FamilyCapacityView {
  childrenLine: string;
  adultsLine: string;
  childrenFull: boolean;
  adultsFull: boolean;
  hint: string | null;
}

export function buildFamilyCapacityView(c: FamilyCapacity): FamilyCapacityView {
  const childrenFull = c.childrenUsed >= c.childrenLimit;
  const adultsFull = c.adultsUsed >= c.adultsLimit;
  const isFree = c.childrenLimit <= FAMILY_FREE_LIMITS.children && c.adultsLimit <= FAMILY_FREE_LIMITS.adults;
  let hint: string | null = null;
  if ((childrenFull || adultsFull) && isFree) {
    hint = "További gyermek vagy gondviselő felvételéhez a Védett Család Plusz szükséges. A meglévő családtagok és gyermekek hozzáférése nem változik.";
  } else if (childrenFull || adultsFull) {
    hint = "Elérted a családonként felvehető legnagyobb létszámot.";
  }
  return {
    childrenLine: `Gyermekek: ${c.childrenUsed} / ${c.childrenLimit}`,
    // A függő meghívók is helyet foglalnak (DB: _family_adult_seats_used).
    adultsLine: `Felnőtt családtagok (függő meghívókkal együtt): ${c.adultsUsed} / ${c.adultsLimit}`,
    childrenFull,
    adultsFull,
    hint,
  };
}
