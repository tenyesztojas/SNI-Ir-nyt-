"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VEDETT_UTVONAL_ACCOUNT_PATH, isIosNativeApp } from "@/lib/vedett-route/native/iosAccount";

// „Fiókom és fióktörlés” — KIZÁRÓLAG a natív iOS appban (App Review 5.1.1(v)).
// Szerveren és az első kliens-renderben semmit nem rajzol (nincs hydration-
// eltérés); mount után a natív híd alapján dönt. Webes böngészőben és Androidon
// sosem jelenik meg. Kliensoldali (soft) navigáció a /vedett-utvonal előtagon
// belüli oldalra, így a Capacitor iOS a WebView-ban tartja.
export default function IosAccountLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(isIosNativeApp());
  }, []);
  if (!show) return null;
  return (
    <Link
      href={VEDETT_UTVONAL_ACCOUNT_PATH}
      className="font-semibold text-sni-brand-blue hover:underline"
      data-testid="vedett-utvonal-account-link"
    >
      Fiókom és fióktörlés
    </Link>
  );
}
