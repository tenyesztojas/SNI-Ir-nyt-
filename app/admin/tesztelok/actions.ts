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
  // auth.users-ből keresünk e-mail alapján
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = data.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
  if (!match) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, pilot_access")
    .eq("id", match.id)
    .single();

  return {
    id: match.id,
    email: match.email ?? "",
    displayName: profile?.display_name ?? "–",
    pilotAccess: (profile?.pilot_access as string[]) ?? [],
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
