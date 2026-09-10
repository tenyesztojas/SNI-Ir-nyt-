/* eslint-disable react/no-unescaped-entities */
"use client";

// PWA install UX sprint (2026-09-10) — a MEGLÉVŐ, sitewide install-
// infrastruktúra (ez a komponens, app/layout.tsx-ben mountolva egyszer,
// PLUSZ public/manifest.json + public/sw.js + PWASessionTracker.tsx)
// bővítése, NEM egy párhuzamos második PWA-rendszer. Az auditálás
// (spec 12. pont) megerősítette: beforeinstallprompt/appinstalled kezelés,
// standalone-detekció és egy iOS "Hozzáadás a Főképernyőhöz" útmutató már
// létezett — ez a kör ezt alakítja nagy, jól látható bottom sheet-té,
// 7 napos cooldown-nal, Navigation Mode fölötti elrejtéssel, és Android
// fallback-kel, amikor a böngésző nem ad beforeinstallprompt eseményt.
//
// SEMMI GPS-adat, SEMMI Supabase — a dismiss-cooldown localStorage-ban él
// (nem érzékeny adat, csak egy időbélyeg), pontosan úgy, mint korábban is.

import { useEffect, useRef, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";
import { isNavigationModeActive, subscribeNavigationModeActive } from "@/lib/pwa/navigationModeSignal";

type Platform = "android" | "ios" | "ios-other-browser" | "other";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-banner-dismissed";
// Spec 22. pont — "ésszerű cooldown legyen, javasolt nagyságrend: 7 nap".
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Spec 23. pont — "ne a render első milliszekundumában villanjon fel...
// néhány másodperces kulturált késleltetéssel, kb. 2-4 másodperc".
const SHOW_DELAY_MS = 2500;

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/.test(ua);
  // 18. pont — iOS-en NEM Safari-szerű böngésző (Chrome/Firefox/Edge/Opera
  // iOS-en mind a rendszer WebKit-et használja, de NINCS ugyanaz az "Add to
  // Home Screen" menüjük, mint a Safarinak) — ezt külön esetként kezeljük,
  // hogy kulturáltan Safari megnyitására irányítsunk, NE ígérjünk nem
  // létező natív képességet.
  const isNonSafariIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isAndroid = /Android/.test(ua);
  if (isAppleMobile && isNonSafariIOSBrowser) return "ios-other-browser";
  if (isAppleMobile) return "ios";
  if (isAndroid) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari saját, nem-szabványos jelzője — típusosan kezelve (nincs
    // rá hivatalos TS DOM típus), lásd spec 14. pont.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// 15. pont — "ne kizárólag user-agent sniffingre építs... tablet ne kapjon
// szükségtelenül agresszív félképernyős modalt, ha a layout ott már
// desktop-szerű". A nagy bottom sheet csak durva pointerű (touch) ÉS szűk
// (mobil-jellegű, <=640px) nézeten jelenhet meg — ez a platform-detekciótól
// (Android/iOS install-flow választás) FÜGGETLEN, külön kapu.
function isMobileLikeViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = window.matchMedia("(max-width: 640px)").matches;
  return coarsePointer && narrowViewport;
}

function readDismissedAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return 0;
  const parsed = Number(raw);
  // A korábbi verzió "1"-et írt (örökös elrejtés) — Number("1")=1, ami egy
  // 1970-hez közeli időbélyeg, tehát a cooldown-számítás szerint MÁR LEJÁRT.
  // A meglévő dismisser-ek emiatt egyszer, kulturáltan újra láthatják az
  // immár 7 napos cooldown-nal működő panelt — ez szándékos, nem hiba.
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDismissedWithinCooldown(): boolean {
  const dismissedAt = readDismissedAt();
  if (!dismissedAt) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export default function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [eligible, setEligible] = useState(false);
  // Spec 23. pont — a késleltetés utáni "megjeleníthető lenne" jelzés,
  // KÜLÖN a navigationModeActive-tól: a sheet csak akkor rendereli magát
  // TÉNYLEGESEN láthatóként, ha armed=true ÉS navigationModeActive=false.
  const [armed, setArmed] = useState(false);
  const [navigationModeActive, setNavigationModeActiveLocal] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (isDismissedWithinCooldown()) {
      setDismissed(true);
      return;
    }
    if (!isMobileLikeViewport()) {
      return;
    }
    const detected = detectPlatform();
    setPlatform(detected);
    if (detected === "other") return;
    setEligible(true);

    const handler = (e: Event) => {
      e.preventDefault();
      // 16. pont — az eventet KIZÁRÓLAG in-memory/state-ben tároljuk, SOHA
      // localStorage-ban/analyticsban.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      fetch("/api/pwa-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "install", platform: detectPlatform() }),
      }).catch(() => {});
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  // Kulturált késleltetés (2-4s) — csak akkor indítjuk el a timert, ha a
  // fenti feltételek már eligible=true-t adtak.
  useEffect(() => {
    if (!eligible) return;
    const timer = setTimeout(() => setArmed(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eligible]);

  // 23./25. pont — Navigation Mode fölött SOHA nem jelenik meg, és ha már
  // nyitva van, amikor Navigation Mode elindul, bevonul (a `visible`
  // levezetés lent ezt már kizárja, nincs szükség explicit bezárás-
  // animációra a MEGLÉVŐ, egyszerű mount/unmount mintázatban).
  useEffect(() => {
    setNavigationModeActiveLocal(isNavigationModeActive());
    return subscribeNavigationModeActive(setNavigationModeActiveLocal);
  }, []);

  const visible = armed && eligible && !installed && !dismissed && !navigationModeActive;

  // Fókusz a panelre nyitáskor (NEM focus trap — a felhasználó bármikor
  // Tab-bal kiléphet, csak a kezdő fókuszt segíti, hogy Escape azonnal
  // működjön és a screen reader bemondja a dialógust).
  useEffect(() => {
    if (visible) dialogRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    setShowIOSModal(false);
  }

  if (!visible) return null;

  const headlineId = "pwa-install-headline";

  return (
    <>
      {/* Nagy bottom sheet (spec 11./20. pont) — kb. 40-55dvh, NEM apró
          toast/banner. safe-area-bottom padding, jól látható headline és
          nagy CTA, "Most nem" mindig elérhető. */}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0" role="presentation">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headlineId}
          className="w-full max-h-[55dvh] min-h-[40dvh] overflow-y-auto rounded-t-2xl bg-white px-5 pt-5 shadow-xl outline-none"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sni-brand-teal/10">
              <Download size={22} className="text-sni-brand-teal" aria-hidden="true" />
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Most nem"
              className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          <h2 id={headlineId} className="mt-3 text-lg font-bold text-gray-900">
            📱 Tedd ki a VédettSarkot a telefonodra
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Alkalmazásként gyorsabban eléred a Védett Útvonalat és a VédettSarok funkcióit.
          </p>

          {platform === "android" && deferredPrompt && (
            <button
              type="button"
              onClick={handleAndroidInstall}
              className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-sni-brand-teal px-4 text-sm font-bold text-white hover:opacity-90"
            >
              Telepítem
            </button>
          )}

          {/* 17. pont — Android fallback, ha a böngésző nem adott
              beforeinstallprompt eseményt: a panel NE legyen törött, adjon
              rövid, NEM egzakt menüpontra hivatkozó útmutatást (browser/
              verzió szerint eltérhet a pontos szöveg). */}
          {platform === "android" && !deferredPrompt && (
            <p className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              A böngésző menüjében válaszd az "Alkalmazás telepítése" vagy "Hozzáadás a kezdőképernyőhöz" lehetőséget.
            </p>
          )}

          {platform === "ios" && (
            <button
              type="button"
              onClick={() => setShowIOSModal(true)}
              className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-sni-brand-teal px-4 text-sm font-bold text-white hover:opacity-90"
            >
              Megmutatjuk, hogyan
            </button>
          )}

          {/* 18. pont — iOS-en nem Safari-szerű böngésző: nincs hamis
              programmatic install gomb, csak kulturált átirányítás. */}
          {platform === "ios-other-browser" && (
            <p className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              Ha nem látod ezt a lehetőséget, nyisd meg az oldalt Safariban.
            </p>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            Most nem
          </button>
        </div>
      </div>

      {/* iOS útmutató modal (Megosztás -> Hozzáadás a Főképernyőhöz) —
          NEM programmatic install, csak instrukció (spec 18. pont). */}
      {showIOSModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Telepítés iPhone-ra</h2>
              <button onClick={() => setShowIOSModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Bezárás">
                <X size={20} />
              </button>
            </div>
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sni-brand-teal/10 text-xs font-bold text-sni-brand-teal">1</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Koppints a Megosztás ikonra</p>
                  <p className="text-xs text-gray-500 mt-0.5">A Safari alsó eszköztárán, középen</p>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
                    <Share size={14} className="text-blue-500" />
                    <span className="text-xs text-gray-600">Megosztás</span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sni-brand-teal/10 text-xs font-bold text-sni-brand-teal">2</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Görgess le és koppints erre</p>
                  <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
                    <PlusSquare size={14} className="text-blue-500" />
                    <span className="text-xs text-gray-600">Hozzáadás a Főképernyőhöz</span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sni-brand-teal/10 text-xs font-bold text-sni-brand-teal">3</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Koppints a „Hozzáadás" gombra</p>
                  <p className="text-xs text-gray-500 mt-0.5">A jobb felső sarokban — kész!</p>
                </div>
              </li>
            </ol>
            <button
              onClick={dismiss}
              className="mt-5 w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              Most nem
            </button>
          </div>
        </div>
      )}
    </>
  );
}
