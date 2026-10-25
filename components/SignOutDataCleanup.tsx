"use client";

// Kijelentkezés / fióktörlés után törli a készüléken tárolt, útvonalhoz
// kötött (helyadatot tartalmazó) navigációs sessiont. A szerver oldali
// kijelentkezés (signOutAction) egy rövid életű, személyes adatot NEM
// tartalmazó jelző sütit állít be; ezt a komponens az első renderkor
// felismeri, törli a localStorage elemet, majd lejáratja a sütit.
// A11y/UI beállításokat (vs-a11y stb.) NEM törli.
//
// Push: a szerver a kijelentkezés ELŐTT leválasztja a böngésző végpontját
// (vu_push_detached csak megerősített törlés után). Kiegészítésként itt a
// böngészős feliratkozást is bontjuk, így a végpont a push-szolgáltatónál is
// érvénytelenné válik. Ha egyik sem igazolható, figyelmeztetünk (nincs hamis siker).

import { useEffect, useState } from "react";
import { clearNavigationSession } from "@/lib/vedett-route/navigation/navigationSessionPersistence";
import { needsSignOutPushWarning, PUSH_DETACHED_COOKIE, SIGN_OUT_PUSH_WARNING } from "@/lib/pushSignOut";

export const SIGNED_OUT_COOKIE = "vu_signed_out";

function hasCookie(name: string): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

async function unsubscribeBrowserPush(): Promise<boolean /* remains */> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return false;
  const ok = await sub.unsubscribe().catch(() => false);
  return !ok;
}

export default function SignOutDataCleanup() {
  const [pushWarning, setPushWarning] = useState(false);
  useEffect(() => {
    try {
      if (hasCookie(SIGNED_OUT_COOKIE)) {
        clearNavigationSession();
        document.cookie = `${SIGNED_OUT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
        const serverDetached = hasCookie(PUSH_DETACHED_COOKIE);
        document.cookie = `${PUSH_DETACHED_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
        unsubscribeBrowserPush()
          .then((remains) => setPushWarning(needsSignOutPushWarning({ serverDetached, browserSubscriptionRemains: remains })))
          .catch(() => setPushWarning(needsSignOutPushWarning({ serverDetached, browserSubscriptionRemains: true })));
      }
    } catch {
      // no-op
    }
  }, []);
  if (!pushWarning) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-soft">
      <p>{SIGN_OUT_PUSH_WARNING}</p>
      <button type="button" onClick={() => setPushWarning(false)} className="mt-2 font-semibold underline">
        Rendben
      </button>
    </div>
  );
}
