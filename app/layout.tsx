import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import PWASessionTracker from "@/components/PWASessionTracker";
import SignOutDataCleanup from "@/components/SignOutDataCleanup";
import AnalyticsConsent from "@/components/analytics/AnalyticsConsent";
import { AccessibilityProvider } from "@/components/accessibility/AccessibilityProvider";

export const metadata: Metadata = {
  title: "VédettSarok \u2013 Autizmus- és ADHD-barát helyek iránytűje",
  description:
    "Közösségi helykereső és értékelő alkalmazás autizmus- és ADHD-barát helyekhez magyar családoknak.",
  manifest: "/manifest.json",
  icons: {
    icon: "/vs-icon.png",
    apple: "/vs-apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce-alapú CSP: a middleware requestenként generál nonce-t és átadja x-nonce headerben.
  // Next.js 14 App Router automatikusan alkalmazza a nonce-t a saját inline scriptjeire.
  // Az itt lévő custom inline scriptek kézzel kapják meg.
  const nonce = headers().get("x-nonce") ?? undefined;

  // A Védett Útvonal PWA-verziót véglegesen elvetettük (2026-09-25
  // cleanup) — a dedikált shell (VedettUtvonalPwaShell) és a saját scope-ú
  // service worker (public/vedett-utvonal-sw.js) törölve lettek. A
  // /vedett-utvonal/app route mostantól csak a normál /vedett-utvonal
  // oldalra irányít (lásd app/vedett-utvonal/app/page.tsx), ezért ez a
  // pathname-gate a Header/Footer/PWAInstallBanner/PWASessionTracker
  // elrejtéséhez a gyakorlatban már sosem aktiválódik (a redirect előbb
  // lefut) — VÁLTOZATLANUL hagyva, hogy ne kelljen a middleware.ts
  // x-pathname header-logikáját is módosítani ehhez a célzott cleanuphoz.
  const pathname = headers().get("x-pathname") ?? "";
  const isVedettUtvonalPwaShell = pathname.startsWith("/vedett-utvonal/app");

  // NATÍV VÉDETT ÚTVONAL (Capacitor Android shell, 2026-10-03): a shell a
  // capacitor.config.ts-ben (android.appendUserAgent) egy EXPLICIT, saját
  // jelölőt (VedettUtvonalNative) fűz a WebView User-Agent-jéhez — ez nem
  // UA-találgatás, hanem általunk beállított marker, és MINDEN kérésen
  // (navigáción át is) jelen van, szerver-oldalon az első renderben is
  // olvasható (nincs villanás). Natív módban a teljes VédettSarok site-
  // chrome (Header/Footer/PWA-banner/PWA-tracker) elrejtődik, hogy az app
  // ne vezessen el a teljes weboldal menüjébe. Normál böngészőben a
  // marker nincs jelen -> a viselkedés változatlan.
  // ROOT CAUSE (2026-10-03, Google belépés utáni regresszió): a public/sw.js
  // service worker MINDEN same-origin GET-et (a navigációkat is) újra-fetch-eli
  // (`fetch(e.request)`), és clients.claim()-mel átveszi az app WebView-t. A
  // Capacitor `appendUserAgent` a WebView saját WebSettings-ében él; a service
  // worker által újra kiadott kérések UA-ja NEM tartalmazza a markert, ezért a
  // szerver-oldali UA-egyezés elveszett és a globális Header visszajött.
  // Megoldás: (1) natívban nincs service worker (lásd a head scriptet), (2) a
  // marker a kliensen sütiben is rögzül (vu_native), amit a szerver az UA
  // mellett szintén olvas. KIZÁRÓLAG MEGJELENÍTÉSI jelző: semmilyen
  // jogosultsági/auth döntés nem függ tőle (egy böngésző "hamisíthatja", de
  // ezzel csak a saját nézetéből rejti el a Header/Footert).
  const isNativeApp =
    (headers().get("user-agent") ?? "").includes("VedettUtvonalNative") ||
    cookies().get("vu_native")?.value === "1";
  const hideSiteChrome = isVedettUtvonalPwaShell || isNativeApp;

  return (
    <html lang="hu">
      <head>
        {/* PWA */}
        <meta name="theme-color" content="#0a4a6e" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="VédettSarok" />
        {/* Service Worker regisztráció – nonce szükséges CSP nonce-alapú módban */}
        {/* suppressHydrationWarning: a böngésző biztonsági okokból törli a nonce DOM-attribútumot
            (nonce hiding / nonce cloaking), ezért React hydration mismatch warningot dobna.
            A nonce CSP-szintű érvényesítése ez előtt megtörténik — a security nem sérül. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(navigator.userAgent.indexOf('VedettUtvonalNative')>-1){document.cookie='vu_native=1; path=/; max-age=31536000; SameSite=Lax; Secure';if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})})}if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){if(k.indexOf('vedettsarok-')===0)caches.delete(k)})})}var d=false,h=function(){if(d)return;d=true;try{var c=window.Capacitor;if(c&&typeof c.nativePromise==='function'){c.nativePromise('SplashScreen','hide',{fadeOutDuration:150}).catch(function(){})}}catch(e){}};try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.name==='first-contentful-paint')h()})}).observe({type:'paint',buffered:true})}catch(e){}window.addEventListener('load',h);return}if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})}}catch(e){}})();`,
          }}
        />
        {/* Akadálymentességi beállítások anti-flash: hydration előtt alkalmazza a mentett prefs-t */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('vs-a11y')||'{}');var h=document.documentElement;if(p.fontScale&&p.fontScale!==100)h.setAttribute('data-font-scale',p.fontScale);if(p.grayscale)h.setAttribute('data-grayscale','1');if(p.contrast&&p.contrast!=='none')h.setAttribute('data-contrast',p.contrast);if(p.underlineLinks)h.setAttribute('data-underline-links','1');if(p.readableFont)h.setAttribute('data-readable-font','1');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-gray-100 font-sans antialiased">
        <AccessibilityProvider>
          {!hideSiteChrome && <Header />}
          <main className="flex-1">{children}</main>
          {!hideSiteChrome && <Footer />}
          {!hideSiteChrome && <PWAInstallBanner />}
          {!hideSiteChrome && <PWASessionTracker />}
        </AccessibilityProvider>
        <SignOutDataCleanup />

        {/* Google Analytics – CSAK explicit hozzájárulás után töltődik be (Basic consent).
            A gtag.js betöltése/config a kliensoldali AnalyticsConsent komponensben történik;
            page_location: origin+pathname, page_referrer: üres (lásd lib/analytics/consent.ts). */}
        <AnalyticsConsent measurementId="G-T748C867DW" nonce={nonce} />
      </body>
    </html>
  );
}
