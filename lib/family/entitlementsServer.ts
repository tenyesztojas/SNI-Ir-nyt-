// Szerveroldali belépési pont a családi funkció-jogosultsághoz. A user és a
// béta-jog a session-ből, az előfizetés hatályos állapota a DB-ből jön
// (get_family_subscription_state: csak a család aktív tagjának válaszol).
// Kliensből kapott állapot nem bemenet. Hiba esetén a fizetős funkció zárva.

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/data";
import { hasFamilyBetaAccess } from "@/lib/family/config";
import {
  decideFamilyFeatureAccess,
  parseFamilySubscriptionState,
  type FamilyAccessDecision,
  type FamilyFeature,
  type FamilySubscriptionState,
} from "@/lib/family/entitlements";

export async function getFamilySubscriptionState(familyId: string): Promise<FamilySubscriptionState | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_family_subscription_state", { p_family_id: familyId });
  if (error) return null;
  return parseFamilySubscriptionState(data);
}

export async function checkFamilyFeature(familyId: string, feature: FamilyFeature): Promise<FamilyAccessDecision> {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) return { allowed: false, reason: "no_state" };
  const betaAccess = hasFamilyBetaAccess(profile);
  const state = await getFamilySubscriptionState(familyId);
  return decideFamilyFeatureAccess({ feature, state, betaAccess });
}
