import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { rateLimiter } from "./lib/rate-limit/index";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit szabályok
//
// Production: Upstash Redis adapter (megosztott state, serverless-biztos)
// Dev/test:   MemoryRateLimiter (instancia-szintű, csak helyi fejlesztésre)
//
// A limitek konfigurálható konstansok – ne legyenek szétszórt magic számok.
// Rationale: brute force és abuse csökkentése, nem precíz API throttling.
// ─────────────────────────────────────────────────────────────────────────────

const RATE_RULES: Array<{
  pattern:  RegExp;
  limit:    number;
  windowMs: number;
  label:    string;
}> = [
  // Kapcsolati form: 5/perc – SPAM ellen
  { pattern: /^\/api\/contact/,           limit: 5,  windowMs: 60_000, label: "contact"       },
  // Igénylés verify: 10/perc – token brute-force ellen
  { pattern: /^\/api\/igenylas-verify/,   limit: 10, windowMs: 60_000, label: "claim-verify"  },
  // OAuth, bejelentkezés: 20/perc
  { pattern: /^\/api\/auth/,              limit: 20, windowMs: 60_000, label: "auth-api"      },
  { pattern: /^\/belepes/,                limit: 20, windowMs: 60_000, label: "login-page"    },
  // Magic link landing: 30/perc – token brute-force ellen
  { pattern: /^\/akademia\/meghivo\//,    limit: 30, windowMs: 60_000, label: "magic-link"    },
  // Share-token lookup: 30/perc – token enumeration ellen
  // NB: nem logoljuk a raw tokent, csak az IP+route pár alapján limitálunk
  { pattern: /^\/vedett-karrier\/preferencialap\/megosztas\//, limit: 30, windowMs: 60_000, label: "share-token" },
  // Compatibility recompute: 20/perc – nem-trivális DB read
  { pattern: /^\/vedett-karrier\/kompatibilitas\//,            limit: 20, windowMs: 60_000, label: "compat"      },
  // Admin API: 30/perc
  { pattern: /^\/api\/admin\//,           limit: 30, windowMs: 60_000, label: "admin-api"     },
  // Összes többi API: 60/perc
  { pattern: /^\/api\//,                  limit: 60, windowMs: 60_000, label: "api-generic"   },
];

function getClientIp(req: NextRequest): string {
  // IP hash-elés helyett egyszerű pseudonymisation:
  // A rate limit key-ben nem tároljuk raw IP + share token kombinációját.
  const raw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return raw;
}

function matchRule(path: string) {
  return RATE_RULES.find((r) => r.pattern.test(path)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nonce alapú CSP
//
// Requestenként egyedi kriptográfiai nonce.
// Next.js 14 App Router automatikusan olvassa az x-nonce headert és
// alkalmazza a nonce-ot a saját generált script tagjeire.
// Layout.tsx olvas headers()-ből és átadja a custom scripteknek.
//
// script-src: 'unsafe-inline' ELTÁVOLÍTVA – nonce + strict-dynamic helyettesíti.
// style-src:  'unsafe-inline' MARADT – Tailwind és CSS-in-JS szükségessége,
//             dokumentált residual risk (nem script-execution kockázat).
// ─────────────────────────────────────────────────────────────────────────────

function buildCsp(nonce: string, supabaseHost: string, isDev: boolean): string {
  // Development: 'unsafe-eval' szükséges a Next.js webpack HMR + React Refresh runtime-hoz.
  // Production:  'unsafe-eval' TILOS — kizárólag nonce + strict-dynamic.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://unpkg.com`;

  return [
    `default-src 'self'`,
    // script-src: nonce + strict-dynamic → nem kell 'unsafe-inline'
    // 'strict-dynamic' trust propagation: GTM által betöltött scriptek is engedélyek
    // Host allowlist (fallback régi böngészőknek, strict-dynamic-ot értő böngésző ignorálja):
    scriptSrc,
    // style-src: 'unsafe-inline' szükséges Tailwind + CSS-in-JS miatt
    // Residual risk: stílus-injektáció, NEM script-execution
    `style-src 'self' 'unsafe-inline' https://unpkg.com`,
    // Képek: adatok, blob és külső HTTPS (térképcsempék, CDN képek)
    `img-src 'self' data: blob: https:`,
    // Fetch/XHR: Supabase + Google OAuth + Analytics + CDN
    `connect-src 'self' https://${supabaseHost} https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://www.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://unpkg.com`,
    // Framek: reCAPTCHA + YouTube (beágyazott videók)
    `frame-src https://www.google.com https://www.youtube.com https://www.youtube-nocookie.com`,
    // Fontok: csak saját (fontsource npm csomagból)
    `font-src 'self'`,
    // Pluginek és objektumok tiltva
    `object-src 'none'`,
    // Base URI korlátozás (relatív URL hijacking ellen)
    `base-uri 'self'`,
    // Form action korlátozás
    `form-action 'self'`,
    // Clickjacking és beágyazás tiltása
    `frame-ancestors 'none'`,
    // HTTP → HTTPS upgrade
    `upgrade-insecure-requests`,
  ].join("; ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Egyéb biztonsági headerek
// (CSP a middlewarebe cost, a többi megmaradhat itt is – nincs duplikáció)
// ─────────────────────────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options":        "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection":       "1; mode=block",
  "Referrer-Policy":        "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Permissions-Policy":     "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
};

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip   = getClientIp(request);

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const rule = matchRule(path);
  if (rule) {
    // Key: label + IP (NEM tartalmazza a share token raw értékét)
    const key    = `rl:${rule.label}:${ip}`;
    const result = await rateLimiter.check(key, rule.limit, rule.windowMs);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({ error: "Túl sok kérés. Próbáld újra később." }),
        {
          status:  429,
          headers: {
            "Content-Type":  "application/json",
            "Retry-After":   String(retryAfter > 0 ? retryAfter : 60),
            "X-RateLimit-Limit":     String(rule.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset":     String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }
  }

  // ── Nonce generálás (CSP) ──────────────────────────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const supabaseHost = supabaseUrl
    ? new URL(supabaseUrl).hostname
    : "*.supabase.co";

  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp(nonce, supabaseHost, isDev);

  // x-nonce headerként átadjuk a Next.js App Routernek és a layout.tsx-nek
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // ── Supabase session refresh ───────────────────────────────────────────────
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  await supabase.auth.getUser();

  // ── Security headers + CSP ─────────────────────────────────────────────────
  // CSP itt, a middleware-ben kerül beállításra (requestenként egyedi nonce miatt)
  response.headers.set("Content-Security-Policy", csp);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // ── Share token oldal: noindex + private cache ─────────────────────────────
  // A megosztott preferencialap személyes adatot tartalmaz.
  // Crawlerek és cache-ek nem tárolhatják.
  if (/^\/vedett-karrier\/preferencialap\/megosztas\//.test(path)) {
    response.headers.set("X-Robots-Tag",   "noindex, nofollow");
    response.headers.set("Cache-Control",  "private, no-store");
    response.headers.set("Pragma",         "no-cache");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
