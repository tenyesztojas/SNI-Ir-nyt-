"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";

export async function searchUserByEmail(email: string) {
  if (!(await isCurrentUserAdmin())) throw new Error("Unauthorized");
  const admin = createAdminClient();

  // admin_find_user_by_email Postgres RPC-t használunk (auth.users hozzáférés)
  const { data, error } = await admin.rpc("admin_find_user_by_email", {
    p_email: email.trim().toLowerCase(),
  });

  if (error) throw new Error(error.message);
  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: (row.display_name as string) ?? "–",
    pilotAccess: (row.pilot_access as string[]) ?? [],
  };
}

export async function setPilotAccess(
  userId: string,
  module: string,
  enabled: boolean
) {
  if (!(await isCurrentUserAdmin())) throw new Error("Unauthorized");
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("pilot_access")
    .eq("id", userId)
    .single();

  const current: string[] = (profile?.pilot_access as string[]) ?? [];
  const updated = enabled
    ? Array.from(new Set([...current, module]))
    : current.filter((m) => m !== module);

  await admin
    .from("profiles")
    .update({ pilot_access: updated })
    .eq("id", userId);

  revalidatePath("/admin/tesztelok");
}

export type PilotTester = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * ZÁRT BÉTA HOZZÁFÉRÉS (2026-09-09) — "Aktív tesztelők" lista egy adott
 * pilot modulhoz (pl. "vedett_route_beta"). Ugyanazt a mintát követi, mint
 * lib/data.ts fetchSubmitterInfo()/getPendingPlacesWithSubmitter(): a
 * profiles tábla NEM tartalmaz e-mailt (az az auth.users-ben van), ezért a
 * találatokhoz a service-role admin.auth.admin.getUserById()-vel párhuzamosan
 * kérjük le az e-mail címeket. Csak admin hívhatja.
 */
export async function listPilotTesters(module: string): Promise<PilotTester[]> {
  if (!(await isCurrentUserAdmin())) throw new Error("Unauthorized");
  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, display_name")
    .contains("pilot_access", [module]);

  if (error) throw new Error(error.message);
  if (!profiles || profiles.length === 0) return [];

  const testers = await Promise.all(
    profiles.map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return {
        id: p.id,
        email: data.user?.email ?? "Ismeretlen e-mail",
        displayName: p.display_name ?? "–",
      };
    })
  );

  return testers.sort((a, b) => a.email.localeCompare(b.email));
}
