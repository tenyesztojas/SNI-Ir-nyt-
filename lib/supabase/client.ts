"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseEnv } from "./envGuard";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function createClient() {
  // Preview: csak a teszt Supabase-projekt (lásd envGuard.ts); hibánál fail closed.
  assertSupabaseEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
