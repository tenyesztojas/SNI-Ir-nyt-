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
  android: {
    // Explicit natív marker a WebView User-Agent-jében — a Next.js layout
    // (app/layout.tsx) ezt olvassa szerver-oldalon, hogy natív módban
    // elrejtse a teljes VédettSarok site-chrome-ot (Header/Footer/PWA-
    // banner). NEM találgatás: mi állítjuk be, minden kérésen jelen van.
    appendUserAgent: 'VedettUtvonalNative/0.1',
  },
};

export default config;
