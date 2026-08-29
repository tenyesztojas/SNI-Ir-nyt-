"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";

export const PILOT_MODULES = [
  { key: "vedett-jelzes",  label: "Védett Jelzés"  },
  { key: "vedett-partner", label: "Védett Partner" },
  { key: "vedettmunka",    label: "VédettMunka"    },
] as const;

export type PilotModule = (typeof PILOT_MODULES)[number]["key"];

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
