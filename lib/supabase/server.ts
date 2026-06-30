import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Szerver oldali (Server Component / Server Action / Route Handler) kliens.
// Cookie-alapú session-t kezel az @supabase/ssr segítségével.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Component-ből hívva ez hibázhat — a middleware frissíti a
          // cookie-kat, ez itt biztonságosan elnyelhető.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Lásd fent.
        }
      },
    },
    global: {
      // A Next.js App Router alapból gyorsítótárazza a fetch-hívásokat
      // (Data Cache), ami miatt egy adatbázisban kívülről (pl. SQL Editorból)
      // változott sor — mint az admin-jogosultság — nem jelenne meg azonnal.
      // Ez kikapcsolja ezt a gyorsítótárazást minden Supabase-lekérdezésre.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
    },
  });
}
