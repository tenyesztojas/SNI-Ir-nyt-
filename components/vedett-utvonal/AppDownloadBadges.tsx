// VÉDETT ÚTVONAL — újrafelhasználható alkalmazásletöltési jelzések (2026-10-09).
//
// Szerver komponens (nincs "use client"): a linkek és a megjelenítési döntés
// KIZÁRÓLAG a lib/vedett-route/appStoreLinks.ts-ből jön, itt nincs URL.
// - Google Play: valódi <a>, új lapon (mobilon a böngésző / Play Áruház
//   kezeli az áruházi linket).
// - App Store: amíg nincs éles URL, NEM link és NEM fókuszálható gomb, csak
//   "Hamarosan iPhone-ra is" jelzés — nem vezet nem létező alkalmazáshoz.
// - Hivatalos jelvénykép csak akkor, ha a config megadja; fix magasság +
//   w-auto, így az arány nem torzul. Enélkül logó nélküli szöveges gomb.
// - A natív Védett Útvonal appon belül (ugyanaz a VedettUtvonalNative UA /
//   vu_native süti jelölő, mint app/layout.tsx isNativeApp) nem jelenik meg.
//   Csak megjelenítési döntés, semmilyen jogosultság nem függ tőle.

function isNativeAppRequest(): boolean {
  return (
    (headers().get("user-agent") ?? "").includes("VedettUtvonalNative") ||
    cookies().get("vu_native")?.value === "1"
  );
}

import { cookies, headers } from "next/headers";
import { Smartphone } from "lucide-react";
import { getVedettAppStoreLinks, type StoreLink } from "@/lib/vedett-route/appStoreLinks";

const LINK_CLASS =
  "inline-flex h-12 items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal focus-visible:ring-offset-2";

function StoreButtonContent({ kicker, label }: { kicker: string; label: string }) {
  return (
    <span className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-black px-4 text-white">
      <Smartphone size={22} aria-hidden="true" className="shrink-0" />
      <span className="flex flex-col text-left leading-tight">
        <span className="text-[11px] font-medium">{kicker}</span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
    </span>
  );
}

function StoreBadge({
  link,
  kicker,
  label,
  ariaLabel,
  testId,
}: {
  link: StoreLink;
  kicker: string;
  label: string;
  ariaLabel: string;
  testId: string;
}) {
  if (link.status !== "available") return null;
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${ariaLabel} (új lapon nyílik)`}
      className={LINK_CLASS}
      data-testid={testId}
    >
      {link.badgeSrc ? (
        <img src={link.badgeSrc} alt="" aria-hidden="true" className="h-12 w-auto" />
      ) : (
        <StoreButtonContent kicker={kicker} label={label} />
      )}
    </a>
  );
}

export default function AppDownloadBadges({
  className = "",
  testId = "app-download-badges",
}: {
  className?: string;
  testId?: string;
}) {
  if (isNativeAppRequest()) return null;
  const { googlePlay, appStore } = getVedettAppStoreLinks();
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`} data-testid={testId}>
      <StoreBadge
        link={googlePlay}
        kicker="Letöltés a"
        label="Google Playről"
        ariaLabel="Védett Útvonal letöltése a Google Playről"
        testId="google-play-badge"
      />
      {appStore.status === "available" ? (
        <StoreBadge
          link={appStore}
          kicker="Letöltés az"
          label="App Store-ból"
          ariaLabel="Védett Útvonal letöltése az App Store-ból"
          testId="app-store-badge"
        />
      ) : (
        <span
          className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-dashed border-gray-400 bg-gray-50 px-4 text-gray-700"
          data-testid="app-store-coming-soon"
        >
          <Smartphone size={22} aria-hidden="true" className="shrink-0" />
          <span className="flex flex-col text-left leading-tight">
            <span className="text-[11px] font-medium">App Store</span>
            <span className="text-[15px] font-bold">Hamarosan iPhone-ra is</span>
          </span>
        </span>
      )}
    </div>
  );
}
