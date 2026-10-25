// Kijelentkezéskori push-leválasztás — közös konstansok és döntési logika
// (függőségmentes, tesztelhető).

export const PUSH_ENDPOINT_FIELD = "push_endpoint";
// Csak MEGERŐSÍTETT szerveroldali leválasztás után kerül beállításra.
export const PUSH_DETACHED_COOKIE = "vu_push_detached";

export type SignOutPushDetach = "detached" | "none" | "failed";

// Figyelmeztetés kell, ha a böngészőben megmaradt egy feliratkozás, és a
// szerver sem erősítette meg, hogy a végpont már senkihez nincs rendelve.
export function needsSignOutPushWarning(input: { serverDetached: boolean; browserSubscriptionRemains: boolean }): boolean {
  return input.browserSubscriptionRemains && !input.serverDetached;
}

export const SIGN_OUT_PUSH_WARNING =
  "Kijelentkeztél, de ezen a böngészőn nem sikerült kikapcsolni a push-értesítéseket. Kapcsold ki az értesítéseket a böngésző webhely-beállításaiban, hogy ne érkezzenek ide értesítések.";

// Kijelentkezéskori leválasztás magja (tárolófüggetlen, tesztelhető).
// KIZÁRÓLAG a hitelesített user saját (endpoint, user_id) sorát törli;
// "detached" csak akkor, ha utána a végponthoz semmilyen sor nem tartozik.
export interface SignOutPushStore {
  deleteOwn(endpoint: string, userId: string): Promise<{ error: unknown }>;
  // true/false: van-e még sor a végponthoz; null: olvasási hiba.
  endpointStillBound(endpoint: string): Promise<boolean | null>;
}

export async function detachOwnPushSubscription(
  store: SignOutPushStore,
  userId: string | null,
  endpoint: string | null
): Promise<SignOutPushDetach> {
  if (!userId || !endpoint) return "none";
  const { error } = await store.deleteOwn(endpoint, userId);
  if (error) return "failed";
  const bound = await store.endpointStillBound(endpoint);
  return bound === false ? "detached" : "failed";
}
