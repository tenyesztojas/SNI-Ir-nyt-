// Szerveroldali jogosultság a „Gyermekem utazási értesítései” kártyához.
// User-session kliens (RLS), kliensadat nélkül; hiba esetén fail closed.

import { createClient } from "@/lib/supabase/server";
import { decideTravelNotificationEligibility, guardianChildIds } from "@/lib/family/travelPushUi";

type FamilyLike = { myRole: string; children: ReadonlyArray<{ id: string }> };

export async function hasTravelNotificationEligibility(userId: string, families: ReadonlyArray<FamilyLike>): Promise<boolean> {
  if (decideTravelNotificationEligibility(families, [])) return true;
  const ids = guardianChildIds(families);
  if (ids.length === 0) return false;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("guardian_child_permissions")
    .select("child_id")
    .eq("guardian_user_id", userId)
    .eq("status", "active")
    .or("can_view_schedule.eq.true,can_manage_schedule.eq.true")
    .in("child_id", ids);
  if (error || !data) return false;
  return decideTravelNotificationEligibility(
    families,
    data.map((r) => r.child_id as string)
  );
}
