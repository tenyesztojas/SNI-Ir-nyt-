"use client";

// Saját, könnyű analitikai hozzájárulás-kezelő (nincs külső CMP). Web és
// Capacitor WebView (Android/iOS) alatt ugyanúgy működik. A GA4-et kizárólag
// "granted" állapotban tölti be (lásd lib/analytics/consent.ts). Nem blokkoló
// alsó panel; az elutasítás ugyanolyan súlyú, mint az engedélyezés.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ANALYTICS_CONSENT_CHANGE_EVENT,
  ANALYTICS_CONSENT_OPEN_EVENT,
  applyAnalyticsConsent,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analytics/consent";

export default function AnalyticsConsent({
  measurementId,
  nonce,
}: {
  measurementId: string;
  nonce?: string;
}) {
  const [visible, setVisible] = useState(false);

  const apply = useCallback(() => {
    applyAnalyticsConsent(readAnalyticsConsent(), {
      win: window,
      doc: document,
      measurementId,
      nonce,
    });
  }, [measurementId, nonce]);

  useEffect(() => {
    apply();
    setVisible(readAnalyticsConsent() === "unset");
    const onOpen = () => setVisible(true);
    window.addEventListener(ANALYTICS_CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ANALYTICS_CONSENT_OPEN_EVENT, onOpen);
  }, [apply]);

  function choose(value: "granted" | "denied") {
    writeAnalyticsConsent(value);
    apply();
    setVisible(false);
    try {
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGE_EVENT));
    } catch {
      // no-op
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Analitikai beállítások"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white px-4 pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <div>
          <p className="font-semibold text-gray-900">Segítesz jobbá tenni a VédettSarkot?</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            Használati statisztikát szeretnénk gyűjteni a Google Analytics segítségével, hogy lássuk,
            mely funkciókat használják, és hol tudjuk javítani a szolgáltatást. Az analitika nem
            szükséges a VédettSarok vagy a Védett Útvonal használatához.{" "}
            <Link href="/adatkezelesi-tajekoztato" className="underline">
              Adatkezelési Tájékoztató
            </Link>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose("granted")}
            className="flex-1 rounded-lg border border-gray-400 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Analitika engedélyezése
          </button>
          <button
            type="button"
            onClick={() => choose("denied")}
            className="flex-1 rounded-lg border border-gray-400 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Elutasítom
          </button>
        </div>
      </div>
    </div>
  );
}
