"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newPlaceSchema, NewPlaceInput } from "@/lib/schemas";
import { slugify, randomSuffix } from "@/lib/slugify";
import { isCurrentUserAdmin } from "@/lib/data";

export async function submitPlace(input: NewPlaceInput): Promise<{ error?: string }> {
  const parsed = newPlaceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Hibás vagy hiányos adatok." };
  }
  const data = parsed.data;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { error: "A hely beküldéséhez be kell jelentkezned." };
  }

  const baseSlug = slugify(data.name) || "hely";
  let slug = baseSlug;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("places").insert({
      slug,
      name: data.name,
      category: data.category,
      city: data.city,
      address: data.address,
      phone: data.phone || null,
      website: data.website || null,
      description: data.description,
      why_friendly: data.whyFriendly,
      own_experience: data.ownExperience,
      status: "pending",
      created_by: user.id,
    });

    if (!error) {
      revalidatePath("/admin/helyek");
      revalidatePath("/profil");
      return {};
    }

    // egyedi slug-ütközés esetén próbálkozunk újra véletlen utótaggal
    if (error.code === "23505") {
      slug = `${baseSlug}-${randomSuffix()}`;
      continue;
    }

    return { error: "Nem sikerült a hely beküldése. Próbáld újra." };
  }

  return { error: "Nem sikerült a hely beküldése. Próbáld újra." };
}

export async function decidePlace(
  placeId: string,
  decision: "approved" | "rejected"
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    return { error: "Nincs jogosultságod ehhez a művelethez." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("places").update({ status: decision }).eq("id", placeId);

  if (error) {
    return { error: "Nem sikerült a státusz frissítése." };
  }

  revalidatePath("/admin/helyek");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}
