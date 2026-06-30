"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Böngészőben futó ("use client") komponensekhez — pl. bejelentkezési állapot
// figyelése (onAuthStateChange).
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
