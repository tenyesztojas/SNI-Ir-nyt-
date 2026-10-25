"use server";

// 14 napos próbaidő indítása — szerverakció. ALAPÉRTELMEZETTEN KIKAPCSOLVA
// (FAMILY_TRIAL_START_ENABLED=true kell). A /csalad gombja még nincs bekötve.
// A tulajdonjog-ellenőrzés és az indítás EGY adatbázis-tranzakcióban fut:
// public.start_family_trial() (20261023 migráció) a session-kliensen,
// auth.uid() alapján. service_role ebben az útvonalban nincs.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isFamilyTrialStartEnabled, startFamilyTrialCore, type TrialStartResult } from "@/lib/family/trialStart";

export async function startFamilyTrialAction(familyId: unknown): Promise<TrialStartResult> {
  if (!isFamilyTrialStartEnabled(process.env)) return { ok: false, error: "disabled" };
  const supabase = createClient();
  const result = await startFamilyTrialCore(
    {
      enabled: () => isFamilyTrialStartEnabled(process.env),
      async getUserId() {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
      },
      async startTrialRpc(id) {
        const { data, error } = await supabase.rpc("start_family_trial", { p_family_id: id });
        if (error) throw error;
        return data;
      },
    },
    familyId
  );
  if (result.ok && result.started) revalidatePath("/csalad");
  return result;
}
