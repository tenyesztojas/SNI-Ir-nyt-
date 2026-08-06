"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";

type Platform = "android" | "ios" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
  const isAndroid = /Android/.test(ua);
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export default function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    const dismissed = localStorage.getItem("pwa-banner-dismissed");
    if (dismissed) { setDismissed(true); return; }
    setPlatform(detectPlatform());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem("pwa-banner-dismissed", "1");
    setDismissed(true);
    setShowIOSModal(false);
  }

  if (installed || dismissed) return null;
  if (platform === "android" && !deferredPrompt) return null;
  if (platform === "other") return null;

  return (
    <>
      {/* Banner */}
      <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-sni-brand-teal/30 bg-white px-4 py-3 shadow-lg flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sni-brand-teal/10">
          <Download size={20} className="text-sni-brand-teal" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">Tedd ki a főoldalra!</p>
          <p className="text-xs text-gray-500 mt-0.5">Gyors elérés, offline tartalom</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {platform === "android" && (
            <button
              onClick={handleAndroidInstall}
              className="rounded-xl bg-sni-brand-teal px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
            >
              Telepítés
            </button>
          )}
          {platform === "ios" && (
            <button
              onClick={() => setShowIOSModal(true)}
              className="rounded-xl bg-sni-brand-teal px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
            >
              Hogyan?
            </button>
          )}
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* iOS útmutató modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Telepítés iPhone-ra</h2>
              <button onClick={() => setShowIOSModal(false)} className="text-gray-400 hover:text-gray-600">
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
                    <span className="text-xs text-gray-600">Főoldalhoz adás</span>
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
              Nem most
            </button>
          </div>
        </div>
      )}
    </>
  );
}
