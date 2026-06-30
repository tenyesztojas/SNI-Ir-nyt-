"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleFavorite(placeId: string): Promise<{ error?: string; active?: boolean }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { error: "A kedvencekhez adáshoz be kell jelentkezned." };
  }

  const { data: existing, error: selectError } = await supabase
    .from("favorites")
    .select("place_id")
    .eq("user_id", user.id)
    .eq("place_id", placeId)
    .maybeSingle();

  if (selectError) {
    return { error: "Nem sikerült a kedvenc állapot lekérése." };
  }

  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", placeId);
    if (error) {
      return { error: "Nem sikerült eltávolítani a kedvencek közül." };
    }
    revalidatePath("/kedvencek");
    return { active: false };
  }

  const { error } = await supabase.from("favorites").insert({ user_id: user.id, place_id: placeId });
  if (error) {
    return { error: "Nem sikerült hozzáadni a kedvencekhez." };
  }
  revalidatePath("/kedvencek");
  return { active: true };
}
