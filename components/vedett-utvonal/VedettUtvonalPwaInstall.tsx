"use client";

// VÉDETT ÚTVONAL NAVIGATION-ONLY PWA sprint (2026-09-21), 6/9/10. pont —
// KÜLÖN app-identitású (saját manifest, saját ikon) install-CTA a Védett
// Útvonal PWA shellhez. UGYANAZT A MINTÁT követi, mint a MEGLÉVŐ sitewide
// components/PWAInstallBanner.tsx (platform-detekció, beforeinstallprompt
// elfogás in-memory state-ben, iOS instrukciós modal, nincs hamis
// programmatic install iOS-en) — nem importál onnan kódot, mert a banner
// forrása szó szerinti regex-tesztekkel védett (__tests__/vedett-route/
// pwa-install-ux.test.ts), és egy megosztott modulba emelés megbontaná
// azokat a teszteket. Ez SZÁNDÉKOS, dokumentált kompromisszum — lásd a
// sprint zárójelentését.
//
// NINCS második install "framework": nincs saját state-management-
// absztrakció, csak ugyanaz az egyszerű useState+useEffect minta, KÜLÖN
// localStorage kulccsal (nem ütközik a sitewide bannerrel).

import { useEffect, useState } from "react";
import { isStandaloneDisplay } from "./VedettUtvonalPwaAnalytics";

type Platform = "android" | "ios" | "other";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "vedett-utvonal-pwa-install-dismissed";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isDismissedWithinCooldown(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed < DISMISS_COOLDOWN_MS;
}

export default function VedettUtvonalPwaInstall() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Csak a SAJÁT (Védett Útvonal) standalone indítást tekintjük "már
    // telepítve" állapotnak: a display-mode önmagában nem különbözteti meg,
    // hogy a jelenlegi standalone ablak a Védett Útvonal PWA-ként indult-e,
    // vagy a VédettSarok PWA-ból navigáltunk ide (lásd a fenti kommentet).
    if (isStandaloneDisplay() && document.referrer === "") {
      setInstalled(true);
      return;
    }
    if (isDismissedWithinCooldown()) {
      setDismissed(true);
      return;
    }
    setPlatform(detectPlatform());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    setShowIosGuide(false);
  }

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  // Desktopon (platform === "other") nincs mobil install-flow — nem
  // renderelünk semmit (ugyanaz az elv, mint a sitewide bannerben).
  if (installed || dismissed || platform === "other") return null;

  return (
    <div className="border-b border-gray-100 bg-sni-brand-teal/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-800">
          Telepítsd a Védett Útvonalat külön alkalmazásként
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Most nem"
          className="text-xs font-semibold text-gray-400 hover:text-gray-600"
        >
          Most nem
        </button>
      </div>

      {platform === "android" && deferredPrompt && (
        <button
          type="button"
          onClick={handleAndroidInstall}
          className="mt-2 rounded-lg bg-sni-brand-teal px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          Telepítem
        </button>
      )}

      {platform === "android" && !deferredPrompt && (
        <p className="mt-2 text-xs text-gray-500">
          A böngésző menüjében válaszd az „Alkalmazás telepítése” vagy „Hozzáadás a kezdőképernyőhöz” lehetőséget.
        </p>
      )}

      {platform === "ios" && !showIosGuide && (
        <button
          type="button"
          onClick={() => setShowIosGuide(true)}
          className="mt-2 rounded-lg bg-sni-brand-teal px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          Megmutatjuk, hogyan
        </button>
      )}

      {platform === "ios" && showIosGuide && (
        <ol className="mt-2 space-y-1 text-xs text-gray-600">
          <li>1. Koppints a Megosztás ikonra a Safari eszköztárán.</li>
          <li>2. Görgess le, majd koppints: Hozzáadás a Főképernyőhöz.</li>
          <li>3. Koppints a „Hozzáadás” gombra — kész!</li>
        </ol>
      )}
    </div>
  );
}
