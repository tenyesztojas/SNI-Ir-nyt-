// Szerveroldali push-leválasztás a kijelentkezés ELŐTT (még érvényes
// sessionnel). Jogosultság: KIZÁRÓLAG a hitelesített user SAJÁT sora törölhető
// (endpoint ÉS user_id egyezés) — lásd detachOwnPushSubscription(). A kliens
// által küldött végpont önmagában semmire nem jogosít: más user (pl. korábbi
// fiókváltásból maradt) sorát nem töröljük. Idegen sor esetén "failed": a
// kliens a böngészős unsubscribe()-bal érvényteleníti a végpontot (a push-
// szolgáltató 410-et ad, a küldő a sort a tulajdonosa nevén törli), és ha ez
// sem sikerül, figyelmeztet.

import { createAdminClient } from "@/lib/supabase/admin";
import { parsePushEndpoint } from "@/lib/pushSubscription";
import { detachOwnPushSubscription, type SignOutPushDetach } from "@/lib/pushSignOut";

export async function detachBrowserPushOnSignOut(userId: string | null, rawEndpoint: unknown): Promise<SignOutPushDetach> {
  if (!userId) return "none";
  if (rawEndpoint == null || rawEndpoint === "") return "none";
  const endpoint = parsePushEndpoint(rawEndpoint);
  if (!endpoint) return "failed";
  try {
    const admin = createAdminClient();
    const result = await detachOwnPushSubscription(
      {
        async deleteOwn(ep, uid) {
          const { error } = await admin.from("push_subscriptions").delete().eq("endpoint", ep).eq("user_id", uid);
          return { error };
        },
        async endpointStillBound(ep) {
          const { data, error } = await admin.from("push_subscriptions").select("endpoint").eq("endpoint", ep).limit(1);
          return error || !data ? null : data.length > 0;
        },
      },
      userId,
      endpoint
    );
    if (result === "failed") console.error("[auth/signout] push detach not confirmed");
    return result;
  } catch {
    console.error("[auth/signout] push detach failed");
    return "failed";
  }
}
