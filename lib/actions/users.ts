"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";

export async function adminCreateUser(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a muvelethez." };

  if (!input.displayName || input.displayName.trim().length < 2)
    return { error: "Add meg a felhasznalo nevet (min. 2 karakter)." };
  if (!input.email || !input.email.includes("@"))
    return { error: "Ervenyes email-cim szukseges." };
  if (!input.password || input.password.length < 8)
    return { error: "A jelszo legalabb 8 karakter legyen." };

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: input.displayName.trim() },
  });

  if (error) {
    if (error.message.includes("already been registered"))
      return { error: "Ez az email-cim mar regisztralt." };
    return { error: error.message };
  }

  if (data.user) {
    await admin
      .from("profiles")
      .upsert(
        { id: data.user.id, display_name: input.displayName.trim(), role: "member" },
        { onConflict: "id" }
      );
  }

  revalidatePath("/admin/felhasznalok");
  return {};
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === userId) return { error: "Sajat magadat nem torölheted." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/felhasznalok");
  return {};
}

export async function changeUserRole(
  userId: string,
  role: "admin" | "member"
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === userId) return { error: "Sajat szerepkoroded nem valtoztathatod." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/felhasznalok");
  return {};
}
