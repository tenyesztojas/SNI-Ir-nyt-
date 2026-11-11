"use server";

// Programajánló beküldése szerveroldalon. Az admin push KIZÁRÓLAG innen,
// egy sikeres beszúrás után indul (a kliens nem kérhet admin pusht).
// Logika és validálás: lib/programSubmission.ts.

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendAdminPush } from "@/lib/push";
import { rateLimiter } from "@/lib/rate-limit";
import { PROGRAM_SUBMIT_RATE_LIMIT, submitProgram, type ProgramSubmitResult } from "@/lib/programSubmission";

function clientIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function submitProgramAction(raw: unknown): Promise<ProgramSubmitResult> {
  return submitProgram(raw, {
    async allowByRateLimit() {
      const r = await rateLimiter.check(
        `rl:program-submit:${clientIp()}`,
        PROGRAM_SUBMIT_RATE_LIMIT.limit,
        PROGRAM_SUBMIT_RATE_LIMIT.windowMs
      );
      return r.allowed;
    },
    async insert(value) {
      // A felhasználó saját (anonim vagy bejelentkezett) munkamenetével, a
      // meglévő "anyone can submit program" RLS insert policy alatt.
      const { error } = await createClient().from("programs").insert(value);
      return !error;
    },
    notifyAdmins: sendAdminPush,
  });
}
