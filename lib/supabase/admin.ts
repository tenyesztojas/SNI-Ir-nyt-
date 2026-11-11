import { createClient } from "@supabase/supabase-js";
import { assertSupabaseEnv } from "./envGuard";

export function createAdminClient() {
  // Preview: csak a teszt-projekt service_role kulcsa (lásd envGuard.ts); fail closed.
  assertSupabaseEnv({ withServiceRole: true });
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
