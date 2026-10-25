// Védett Család — központi előfizetési jogosultság-döntés (függőségmentes,
// tesztelhető). Az előfizetés HATÁLYOS állapotát a DB számolja
// (get_family_subscription_state / _family_subscription_effective); ez a
// modul csak a fizetési kapu + béta-megőrzés szabályait alkalmazza.
// Kliensoldali UI-állapot SOHA nem bemenet: a hívó a szerveroldali
// lekérdezés eredményét adja át (lásd entitlementsServer.ts).

export const FAMILY_SUBSCRIPTION_STATUSES = ["free", "trialing", "active", "past_due", "canceled", "expired"] as const;
export type FamilySubscriptionStatus = (typeof FAMILY_SUBSCRIPTION_STATUSES)[number];

// Jogosultság-kulcsok — egyezik a DB subscription_plan_features tartalmával
// (20261022_family_trial_protection.sql; teszt-DB: 4 ingyenes + 8 Plusz).
export const FREE_FAMILY_FEATURES = [
  "family.child_profile.basic",
  "family.schedule.basic",
  "family.safety.basic",
  "family.notification.basic",
] as const;
export const PLUS_ONLY_FAMILY_FEATURES = [
  "family.children.multiple",
  "family.schedule.advanced",
  "family.guardians.multiple",
  "family.notification.advanced",
] as const;
export const FAMILY_FEATURES = [...FREE_FAMILY_FEATURES, ...PLUS_ONLY_FAMILY_FEATURES] as const;
export type FamilyFeature = (typeof FAMILY_FEATURES)[number];

// Az alapvető (ingyenes) funkciók — köztük a biztonsági alapfunkció — SOHA
// nem kerülhetnek fizetési kapu mögé (a döntés ezt kódban is kikényszeríti).
export const ALWAYS_FREE_FEATURES: ReadonlySet<FamilyFeature> = new Set<FamilyFeature>(FREE_FAMILY_FEATURES);

// Fizetési kapu jelenleg EGYETLEN funkcióra sincs bekapcsolva — a meglévő
// működés nem korlátozható egyeztetés nélkül. Bekapcsolás: üzleti döntés után
// a Plusz-kulcs felvétele ide.
export const PAYWALLED_FEATURES: ReadonlySet<FamilyFeature> = new Set<FamilyFeature>();

export const FAMILY_TRIAL_DAYS = 14;

export interface FamilySubscriptionState {
  status: FamilySubscriptionStatus;
  planKey: string;
  effectivePlanKey: string;
  paidAccess: boolean;
  features: string[];
  // A DB szerint; NULL = a próbaidő még nem indult (a trigger a két dátumot együtt kezeli).
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}

// Szigorú értelmezés: bármilyen eltérés -> null (a hívó fail closed kezeli).
export function parseFamilySubscriptionState(raw: unknown): FamilySubscriptionState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || !(FAMILY_SUBSCRIPTION_STATUSES as readonly string[]).includes(r.status)) return null;
  if (typeof r.plan_key !== "string" || typeof r.effective_plan_key !== "string") return null;
  if (typeof r.paid_access !== "boolean") return null;
  if (!Array.isArray(r.features) || !r.features.every((f) => typeof f === "string")) return null;
  const optDate = (v: unknown): string | null | undefined => (v == null ? null : typeof v === "string" ? v : undefined);
  const trialEndsAt = optDate(r.trial_ends_at);
  const currentPeriodEnd = optDate(r.current_period_end);
  if (trialEndsAt === undefined || currentPeriodEnd === undefined) return null;
  return {
    status: r.status as FamilySubscriptionStatus,
    planKey: r.plan_key,
    effectivePlanKey: r.effective_plan_key,
    paidAccess: r.paid_access,
    features: r.features as string[],
    trialEndsAt,
    currentPeriodEnd,
  };
}

export type FamilyAccessReason = "always_free" | "not_paywalled" | "beta" | "entitled" | "not_entitled" | "no_state";
export interface FamilyAccessDecision {
  allowed: boolean;
  reason: FamilyAccessReason;
}

export function decideFamilyFeatureAccess(input: {
  feature: FamilyFeature;
  state: FamilySubscriptionState | null;
  // Szerveroldalon számolt béta-hozzáférés (hasFamilyBetaAccess(profile)).
  betaAccess: boolean;
  paywalled?: ReadonlySet<FamilyFeature>;
}): FamilyAccessDecision {
  const paywalled = input.paywalled ?? PAYWALLED_FEATURES;
  if (ALWAYS_FREE_FEATURES.has(input.feature)) return { allowed: true, reason: "always_free" };
  if (!paywalled.has(input.feature)) return { allowed: true, reason: "not_paywalled" };
  // Béta-megőrzés: a jelenlegi bétafelhasználók hozzáférése nem sérülhet.
  // (Végleges béta→fizetős átmenet: üzleti döntés.)
  if (input.betaAccess) return { allowed: true, reason: "beta" };
  if (!input.state) return { allowed: false, reason: "no_state" };
  if (input.state.paidAccess && input.state.features.includes(input.feature)) return { allowed: true, reason: "entitled" };
  // Ingyenes csomag funkciói (paidAccess nélkül is) a DB features listájában.
  if (!input.state.paidAccess && input.state.features.includes(input.feature)) return { allowed: true, reason: "entitled" };
  return { allowed: false, reason: "not_entitled" };
}
