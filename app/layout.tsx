import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
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
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))}`,
          }}
        />
        {/* Akadálymentességi beállítások anti-flash: hydration előtt alkalmazza a mentett prefs-t */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('vs-a11y')||'{}');var h=document.documentElement;if(p.fontScale&&p.fontScale!==100)h.setAttribute('data-font-scale',p.fontScale);if(p.grayscale)h.setAttribute('data-grayscale','1');if(p.contrast&&p.contrast!=='none')h.setAttribute('data-contrast',p.contrast);if(p.underlineLinks)h.setAttribute('data-underline-links','1');if(p.readableFont)h.setAttribute('data-readable-font','1');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-gray-100 font-sans antialiased">
        <AccessibilityProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <PWAInstallBanner />
          <PWASessionTracker />
        </AccessibilityProvider>

        {/* Google Analytics – nonce szükséges a CSP script-src nonce-alapú engedélyhez */}
        <Script
          nonce={nonce}
          src="https://www.googletagmanager.com/gtag/js?id=G-T748C867DW"
          strategy="afterInteractive"
        />
        <Script nonce={nonce} id="ga-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-T748C867DW');`}
        </Script>
      </body>
    </html>
  );
}
