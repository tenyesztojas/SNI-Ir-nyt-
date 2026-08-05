import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting — in-memory, IP-alapú csúszóablak
// Véd brute force, spam és scripttámadások ellen.
// Megjegyzés: serverless környezetben instancia-szintű; globális limithez
// Upstash Redis ajánlott (ingyenes tier elég).
// ─────────────────────────────────────────────────────────────────────────────

interface RateWindow {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateWindow>();

// Érzékeny végpontok és limitjeik (kérés / percenként)
const RATE_RULES: Array<{ pattern: RegExp; limit: number; windowMs: number }> = [
  { pattern: /^\/api\/contact/,          limit: 5,   windowMs: 60_000  }, // kapcsolati form: 5/perc
  { pattern: /^\/api\/igenylas-verify/,  limit: 10,  windowMs: 60_000  }, // igénylés verify: 10/perc
  { pattern: /^\/api\/auth/,             limit: 20,  windowMs: 60_000  }, // OAuth: 20/perc
  { pattern: /^\/belepes/,               limit: 20,  windowMs: 60_000  }, // bejelentkezés oldal
  { pattern: /^\/api\//,                 limit: 60,  windowMs: 60_000  }, // minden más API: 60/perc
];

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(
  ip: string,
  path: string
): { allowed: boolean; retryAfter?: number } {
  const rule = RATE_RULES.find((r) => r.pattern.test(path));
  if (!rule) return { allowed: true };

  const key = `${ip}:${rule.pattern.toString()}`;
  const now = Date.now();
  const window = rateLimitStore.get(key);

  if (!window || now > window.resetAt) {
    // Új ablak nyitása
    rateLimitStore.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true };
  }

  if (window.count >= rule.limit) {
    const retryAfter = Math.ceil((window.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  window.count++;
  return { allowed: true };
}

// Régi bejegyzések törlése (memória szivárgás ellen)
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60_000) return; // 5 percenként
  lastCleanup = now;
  for (const [key, window] of rateLimitStore) {
    if (now > window.resetAt) rateLimitStore.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware — auth session frissítés + rate limiting
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip = getClientIp(request);

  maybeCleanup();

  // Rate limit ellenőrzés
  const { allowed, retryAfter } = checkRateLimit(ip, path);
  if (!allowed) {
    return new NextResponse(
      JSON.stringify({ error: "Túl sok kérés. Próbáld újra később." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter ?? 60),
          "X-RateLimit-Limit": "exceeded",
        },
      }
    );
  }

  // Supabase auth session frissítése (minden kérésnél)
  let response = NextResponse.next({ request: { headers: request.headers } });

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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
