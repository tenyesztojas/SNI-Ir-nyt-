/** @type {import('next').NextConfig} */

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co";

// Content-Security-Policy — megakadályozza az XSS és külső tartalom-injektálást
const cspDirectives = [
  // Scriptek: saját + Google OAuth/reCAPTCHA + Google Analytics + Leaflet CDN
  `script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`,
  // Stílusok: saját + inline (Tailwind/CSS-in-JS) + Leaflet CDN
  `style-src 'self' 'unsafe-inline' https://unpkg.com`,
  // Képek: saját + minden HTTPS forrás (képek nem futtatnak kódot, külső domain-ek nem prediktálhatók)
  `img-src 'self' data: blob: https:`,
  // API hívások: saját + Supabase + Google OAuth + Google Analytics
  `connect-src 'self' https://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://www.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://unpkg.com`,
  // Frame: csak reCAPTCHA
  `frame-src https://www.google.com`,
  // Font: saját (fontsource npm csomagból, nem CDN)
  `font-src 'self'`,
  // Alap: minden más tiltva
  `default-src 'self'`,
  // Nem engedünk beágyazást
  `frame-ancestors 'none'`,
  // HTTPS-re frissítés
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  // Clickjacking ellen
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing ellen
  { key: "X-Content-Type-Options", value: "nosniff" },
  // XSS védelem (régi böngészőknek)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Referrer szivárgás ellen
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS kényszer (1 év, aldomainek is)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Felesleges böngészőfunkciók tiltása
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  // CSP
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig = {
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
