/** @type {import('next').NextConfig} */

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co";

// Content-Security-Policy — megakadályozza az XSS és külső tartalom-injektálást
const cspDirectives = [
  // Scriptek: csak saját domain + Google OAuth/reCAPTCHA
  `script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com`,
  // Stílusok: saját + inline (Tailwind/CSS-in-JS)
  `style-src 'self' 'unsafe-inline'`,
  // Képek: saját + Supabase Storage + OpenStreetMap + adatURl
  `img-src 'self' data: blob: https://${supabaseHost} https://*.tile.openstreetmap.org https://*.openstreetmap.org`,
  // API hívások: csak saját + Supabase + Google OAuth API
  `connect-src 'self' https://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://www.googleapis.com`,
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
