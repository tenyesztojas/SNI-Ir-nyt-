// Védett Család — előfizetési felület megjelenítési modellje (függőségmentes,
// tesztelhető). Bemenet KIZÁRÓLAG a szerveroldali, jogosultság-ellenőrzött
// get_family_subscription_state eredménye (parseFamilySubscriptionState).
// Fizetési / próbaidő-indító művelet NINCS: a felület csak tájékoztat.

export interface SubscriptionStateLike {
  status: string;
  effectivePlanKey: string;
  paidAccess: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

// Tervezett díjak — fizetési szolgáltató még nincs, a felület "tervezett"-ként jelöli.
export const FAMILY_PLUS_PRICES = { monthlyHuf: 1990, yearlyHuf: 19900, planned: true } as const;

// Kulcsok = lib/family/entitlements.ts FAMILY_FEATURES (teszt ellenőrzi).
export const FAMILY_FEATURE_LABELS: ReadonlyArray<{ key: string; label: string; plan: "free" | "plus" }> = [
  { key: "family.child_profile.basic", label: "Gyermekprofil", plan: "free" },
  { key: "family.schedule.basic", label: "Napirend alapfunkciók", plan: "free" },
  { key: "family.safety.basic", label: "Biztonsági alapfunkciók (utazási jelzések)", plan: "free" },
  { key: "family.notification.basic", label: "Alap értesítések", plan: "free" },
  { key: "family.children.multiple", label: "Több gyermek", plan: "plus" },
  { key: "family.schedule.advanced", label: "Bővített napirend", plan: "plus" },
  { key: "family.guardians.multiple", label: "Több gondviselő", plan: "plus" },
  { key: "family.notification.advanced", label: "Bővített értesítések", plan: "plus" },
];

const STATUS_LABELS: Record<string, string> = {
  free: "Ingyenes csomag",
  trialing: "Próbaidő",
  active: "Aktív előfizetés",
  past_due: "Fizetés függőben",
  canceled: "Lemondva",
  expired: "Lejárt",
};

export function formatHuf(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Ft`;
}

export function formatDateHu(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "long", day: "numeric" }).format(d);
}

export type TrialView =
  | { kind: "eligible" } // még nem használt: a lehetőség megjeleníthető (indítás: hamarosan)
  | { kind: "active"; endsAt: string } // folyamatban
  | { kind: "used" }; // lejárt vagy már felhasznált: nem kínálható újra

export type SubscriptionView =
  | { available: false }
  | {
      available: true;
      planLabel: "Ingyenes" | "Plusz";
      statusLabel: string;
      paidAccess: boolean;
      trial: TrialView;
      periodEndLabel: string | null;
    };

export function buildSubscriptionView(state: SubscriptionStateLike | null, now: Date): SubscriptionView {
  if (!state) return { available: false };
  const trialEnd = state.trialEndsAt ? new Date(state.trialEndsAt) : null;
  let trial: TrialView;
  if (!state.trialEndsAt) trial = { kind: "eligible" };
  else if (state.status === "trialing" && trialEnd && trialEnd.getTime() > now.getTime() && state.paidAccess)
    trial = { kind: "active", endsAt: formatDateHu(state.trialEndsAt) ?? "" };
  else trial = { kind: "used" };
  const showPeriod = state.paidAccess && state.status !== "trialing" && state.currentPeriodEnd;
  return {
    available: true,
    planLabel: state.paidAccess && state.effectivePlanKey === "family_plus" ? "Plusz" : "Ingyenes",
    statusLabel: STATUS_LABELS[state.status] ?? "Ismeretlen állapot",
    paidAccess: state.paidAccess,
    trial,
    periodEndLabel: showPeriod ? formatDateHu(state.currentPeriodEnd as string) : null,
  };
}
