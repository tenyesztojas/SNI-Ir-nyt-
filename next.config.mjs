/** @type {import('next').NextConfig} */

// ─────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy → MIDDLEWARE-BE KÖLTÖZÖTT (middleware.ts)
//
// A CSP requestenként egyedi nonce-t tartalmaz (script-src 'nonce-...' + 'strict-dynamic').
// Statikus next.config.mjs headerekben nonce nem alkalmazható.
// A middleware minden kérésre beállítja a CSP headert.
//
// A többi biztonsági header itt marad (nem igényel per-request adatot).
// Duplikáció elkerülése: a middleware is beállítja ezeket, de next.config.mjs
// fallback-ként megőrzi – ez redundáns de nem ütköző.
// ─────────────────────────────────────────────────────────────────────────────

const securityHeaders = [
  // Clickjacking ellen
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing ellen
  { key: "X-Content-Type-Options", value: "nosniff" },
  // XSS védelem (régi böngészőknek)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Referrer szivárgás ellen (share-token route miatt különösen fontos)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS kényszer (1 év, aldomainek is)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Felesleges böngészőfunkciók tiltása
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  // CSP NEM KERÜL IDE – a middleware.ts kezeli nonce-alapon
];

// /vedettkarrier/* → /vedettmunka/* átirányítás (publikus névváltozás)
const VEDETTKARRIER_REDIRECTS = [
  "allasok",
  "allasok/:id*",
  "munkaltatok",
  "munkaltatoi-regisztracio",
  "hirdetes-feladas",
  "oneletrajz",
  "oneletrajz/szerkeszto",
  "ertesito",
  "karrieriranytu",
  "jelentkezes/:jobId*",
  "munkaprofil",
  "admin/:path*",
].map((path) => ({
  source: `/vedettkarrier/${path}`,
  destination: `/vedettmunka/${path}`,
  permanent: false,
}));

const nextConfig = {
  async redirects() {
    return [
      // /vedettkarrier (főoldal)
      { source: "/vedettkarrier", destination: "/vedettmunka", permanent: false },
      ...VEDETTKARRIER_REDIRECTS,
    ];
  },

  async headers() {
    return [
      {
        // Minden oldalra alkalmazzuk
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
