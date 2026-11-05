// VÉDETT ÚTVONAL — újrafelhasználható alkalmazásletöltési jelvények
// (2026-10-09; App Store-aktiválás: 2026-11-05).
//
// Szerver komponens (nincs "use client"): a linkek, feliratok és jelvények
// KIZÁRÓLAG a lib/vedett-route/appStoreLinks.ts-ből jönnek, itt nincs URL.
// - Mindkét áruház valódi <a>, új lapon (mobilon a böngésző / áruház kezeli).
// - A jelvénykép már tartalmazza az áruház nevét, ezért mellette nincs
//   ismételt szöveg; a magyar akadálymentes név az aria-label-ben van, a kép
//   dekoratív (alt="").
// - Fix magasság + w-auto + eredeti width/height attribútum: az arány nem
//   torzul, betöltéskor nincs elrendezés-ugrás.
// - A natív Védett Útvonal appon belül (ugyanaz a VedettUtvonalNative UA /
//   vu_native süti jelölő, mint app/layout.tsx isNativeApp) nem jelenik meg.
//   Csak megjelenítési döntés, semmilyen jogosultság nem függ tőle.

import { cookies, headers } from "next/headers";
import { getVedettAppStoreLinks, type StoreLink } from "@/lib/vedett-route/appStoreLinks";

function isNativeAppRequest(): boolean {
  return (
    (headers().get("user-agent") ?? "").includes("VedettUtvonalNative") ||
    cookies().get("vu_native")?.value === "1"
  );
}

const LINK_CLASS =
  "inline-flex shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal focus-visible:ring-offset-2";

function StoreBadge({ link, testId }: { link: StoreLink; testId: string }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${link.label} – Védett Útvonal (új lapon nyílik)`}
      className={LINK_CLASS}
      data-testid={testId}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- statikus, kis PNG; next/image itt nem ad előnyt */}
      <img
        src={link.badge.src}
        width={link.badge.width}
        height={link.badge.height}
        alt=""
        aria-hidden="true"
        className="h-12 w-auto"
      />
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
      <StoreBadge link={googlePlay} testId="google-play-badge" />
      <StoreBadge link={appStore} testId="app-store-badge" />
    </div>
  );
}
