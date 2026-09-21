"use client";

// VEDETT UTVONAL PWA INSTALL CTA - 3. kor, "megbizhatoan felfedezheto"
// hotfix (2026-09-21).
//
// ROOT CAUSE a korabbi (a2706ff) verzioban: a CTA "mar telepitve" allapotat
// egy isStandaloneDisplay() && document.referrer === "" heurisztika
// dontotte el. Ez KRITIKUSAN HIBAS feltevesre epult: a display-mode
// standalone media query CSAK azt mondja meg, hogy a jelenlegi ABLAK/tab
// standalone chrome-ban fut-e - azt NEM tudja megkulonboztetni, hogy EZ A
// KONKRET manifest (Vedett Utvonal) lett-e telepitve, vagy egy MASIK,
// ugyanazon origin alol telepitett PWA (VedettSarok) ablaka navigalt ide.
// A document.referrer tovabba NEM megbizhato jelzes app-identitasra (a
// spec kifejezetten kizarja ennek hasznalatat erre a celra).
//
// EZERT: ez a fajl mostantol NEM probal "mar telepitve Vedett Utvonalkent"
// allapotot kitalalni display-mode/referrer alapjan. A CTA lathatosaga
// ROUTE/PLATFORM alapu (a hivo oldal donti el, hogy egyaltalan mountolja-e
// - lasd app/vedett-utvonal/page.tsx es VedettUtvonalPwaShell.tsx), es
// KIZAROLAG ket, VALODI, megbizhato jelzes rejtheti el utana:
//   1) a felhasznalo explicit "Most nem"-et nyomott (localStorage cooldown)
//   2) a bongeszo TENYLEGESEN kivaltotta az "appinstalled" esemenyt EBBEN
//      a session-ben (ez egy valodi, a platform altal garantalt esemeny,
//      NEM egy kitalalt detekcio).
// Ha egy mar ONALLOAN telepitett Vedett Utvonal PWA-ban a CTA redundansan
// megjelenne, az szandekos kompromisszum (lasd a hotfix specifikaciojat):
// jobb egy redundans CTA, mint hogy egy meg nem telepitett felhasznalo
// SOHA ne lassa a telepitesi lehetoseget.
//
// UGYANAZT A MINTAT koveti, mint a MEGLEVO sitewide
// components/PWAInstallBanner.tsx (platform-detekcio, beforeinstallprompt
// elfogas in-memory state-ben, iOS instrukcios modal, nincs hamis
// programmatic install iOS-en) - nem importal onnan kodot, mert a banner
// forrasa szo szerinti regex-tesztekkel vedett
// (__tests__/vedett-route/pwa-install-ux.test.ts).
//
// DIAGNOSZTIKA (?debugPwa=1): a hotfix spec kifejezetten kerte, hogy a
// kovetkezo production-hiba-jelentes ELOTT legyen egy production-safe mod
// bebizonyitani, mi tortenik valodi telefonon. A panel ugyanazt az
// allapotot mutatja, amit a CTA tenylegesen hasznal a dontesehez - nincs
// kulon, parhuzamos diagnosztikai rendszer. Csak ?debugPwa=1 eseten
// jelenik meg, nem tartalmaz erzekeny adatot (nincs GPS/Supabase/PII).

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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

function getActiveManifestHref(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null;
}

export default function VedettUtvonalPwaInstall() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // "installed" MOSTANTOL kizarolag a valodi, bongeszo altal garantalt
  // "appinstalled" esemenybol szarmazhat - lasd a fenti ROOT CAUSE
  // magyarazatot arra, hogy miert tunt el ez korabban a display-mode/
  // referrer heurisztika miatt.
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<{
    standalone: boolean;
    navigatorStandalone: boolean | "n/a";
    referrer: string;
    manifestHref: string | null;
    userAgent: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDebugEnabled(new URLSearchParams(window.location.search).get("debugPwa") === "1");
    setDebugSnapshot({
      standalone: isStandaloneDisplay(),
      navigatorStandalone:
        "standalone" in window.navigator
          ? (window.navigator as Navigator & { standalone?: boolean }).standalone === true
          : "n/a",
      referrer: document.referrer,
      manifestHref: getActiveManifestHref(),
      userAgent: window.navigator.userAgent,
    });
  }, [pathname]);

  useEffect(() => {
    if (isDismissedWithinCooldown()) {
      setDismissed(true);
    } else {
      setPlatform(detectPlatform());
    }

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

  // Desktopon (platform === "other") nincs mobil install-flow. Ez a HAROM
  // feltétel az EGYETLEN, ami elrejtheti a CTA-t - nincs display-mode/
  // referrer alapu negyedik ag (lasd a fenti ROOT CAUSE magyarazatot).
  const hideReason: string | null = installed
    ? "appinstalled-event"
    : dismissed
      ? "dismissed-cooldown"
      : platform === "other"
        ? "desktop-platform"
        : null;
  const ctaVisible = hideReason === null;

  const debugPanel = debugEnabled && debugSnapshot ? (
    <div className="mx-4 mt-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-700">
      <p className="font-bold text-gray-900">Vedett Utvonal PWA debug (?debugPwa=1)</p>
      <p>pathname: {pathname}</p>
      <p>display-mode standalone: {String(debugSnapshot.standalone)}</p>
      <p>navigator.standalone: {String(debugSnapshot.navigatorStandalone)}</p>
      <p>document.referrer: {debugSnapshot.referrer || "(empty)"}</p>
      <p>beforeinstallprompt captured: {String(deferredPrompt !== null)}</p>
      <p>install component mounted: true</p>
      <p>manifest href: {debugSnapshot.manifestHref ?? "(none found)"}</p>
      <p>user agent: {debugSnapshot.userAgent}</p>
      <p>detected platform: {platform}</p>
      <p>install CTA decision: {ctaVisible ? "SHOW" : "HIDE"}</p>
      <p>hide reason: {hideReason ?? "n/a"}</p>
    </div>
  ) : null;

  if (!ctaVisible) return debugPanel;

  return (
    <>
      <div className="border-b border-gray-100 bg-sni-brand-teal/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-800">
            Védett Útvonal telepítése
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
            Telepítéshez nyisd meg a böngésző menüjét, majd válaszd az „Alkalmazás telepítése” vagy „Hozzáadás a kezdőképernyőhöz” lehetőséget.
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
      {debugPanel}
    </>
  );
}
