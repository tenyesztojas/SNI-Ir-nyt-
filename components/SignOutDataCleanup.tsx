"use client";

// Kijelentkezés / fióktörlés után törli a készüléken tárolt, útvonalhoz
// kötött (helyadatot tartalmazó) navigációs sessiont. A szerver oldali
// kijelentkezés (signOutAction) egy rövid életű, személyes adatot NEM
// tartalmazó jelző sütit állít be; ezt a komponens az első renderkor
// felismeri, törli a localStorage elemet, majd lejáratja a sütit.
// A11y/UI beállításokat (vs-a11y stb.) NEM törli.

import { useEffect } from "react";
import { clearNavigationSession } from "@/lib/vedett-route/navigation/navigationSessionPersistence";

export const SIGNED_OUT_COOKIE = "vu_signed_out";

export default function SignOutDataCleanup() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${SIGNED_OUT_COOKIE}=`))) {
        clearNavigationSession();
        document.cookie = `${SIGNED_OUT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      }
    } catch {
      // no-op
    }
  }, []);
  return null;
}
