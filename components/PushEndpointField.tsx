"use client";

// Rejtett mező a kijelentkező űrlapokba: a böngésző aktuális push-végpontja,
// hogy a szerver a kijelentkezés ELŐTT leválaszthassa (signOutAction).
// Ha nincs feliratkozás / service worker (pl. natív app), üres marad.

import { useEffect, useState } from "react";
import { PUSH_ENDPOINT_FIELD } from "@/lib/pushSignOut";

export default function PushEndpointField() {
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (alive && sub?.endpoint) setEndpoint(sub.endpoint);
      } catch {
        // nincs mit küldeni; a kijelentkezés utáni kliens-takarítás pótolja
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return <input type="hidden" name={PUSH_ENDPOINT_FIELD} value={endpoint} />;
}
