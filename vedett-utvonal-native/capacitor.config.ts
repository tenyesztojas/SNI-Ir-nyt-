import type { CapacitorConfig } from '@capacitor/cli';

// Vedett Utvonal natv Android shell — v0.1.
//
// EZ NEM egy helyi web-bundle-t csomagol (nincs sajat "www" build) — a
// natv shell a MEGLEVO production Vedett Utvonal weboldalt tolti be
// kozvetlenul, Capacitor server.url-en keresztul. Igy a routing/navigacio
// logika NEM duplikalodik, es a meglevo Next.js/Vercel API + VPS route
// service + MOTIS backend valtozas nelkul szolgalja ki a natv appot is.
//
// SZANDEKOSAN csak HTTPS — nincs cleartext HTTP engedelyezve, nincs
// androidScheme http override.
const config: CapacitorConfig = {
  appId: 'hu.vedettsarok.utvonal',
  appName: 'Védett Útvonal',
  webDir: 'www',
  server: {
    url: 'https://www.vedettsarok.hu/vedett-utvonal',
    androidScheme: 'https',
    cleartext: false,
  },
  // Natív indítási splash (@capacitor/splash-screen): a launch téma splash-e a
  // BridgeActivity első frame-jénél véget érne, és a távoli oldal betöltéséig
  // fehér WebView látszana. A splash marad, amíg a Védett Útvonal oldal az első
  // rendert jelzi (az oldal a natív hídon át hívja a SplashScreen.hide-ot),
  // de LEGFELJEBB launchShowDuration ideig — soha nem ragadhat be.
  backgroundColor: '#F3F4F6',
  plugins: {
    SplashScreen: {
      launchShowDuration: 4000,
      launchAutoHide: true,
      launchFadeOutDuration: 150,
      backgroundColor: '#F3F4F6',
      showSpinner: false,
    },
  },
  android: {
    // Explicit natív marker a WebView User-Agent-jében — a Next.js layout
    // (app/layout.tsx) ezt olvassa szerver-oldalon, hogy natív módban
    // elrejtse a teljes VédettSarok site-chrome-ot (Header/Footer/PWA-
    // banner). NEM találgatás: mi állítjuk be, minden kérésen jelen van.
    appendUserAgent: 'VedettUtvonalNative/0.1 Android',
  },
  ios: {
    // Ugyanaz a natív marker, mint Androidon — a Next.js layout ebből tudja,
    // hogy natív módban elrejtse a VédettSarok site-chrome-ot.
    // contentInset (alapértelmezett 'automatic'): a WKWebView magától a biztonságos
    // területen belül marad (notch / Dynamic Island / home indicator) — nincs web CSS módosítás.
    appendUserAgent: 'VedettUtvonalNative/0.1 iOS',
  },
};

export default config;
