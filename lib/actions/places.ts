"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newPlaceSchema, NewPlaceInput } from "@/lib/schemas";
import { slugify, randomSuffix } from "@/lib/slugify";
import { isCurrentUserAdmin } from "@/lib/data";

export async function submitPlace(input: NewPlaceInput, images: string[] = []): Promise<{ error?: string }> {
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
      images: images.length > 0 ? images : null,
      status: "pending",
      created_by: user.id,
    });

    if (!error) {
      revalidatePath("/admin/helyek");
      revalidatePath("/profil");
      return {};
    }

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
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const supabase = createClient();
  const { error } = await supabase.from("places").update({ status: decision }).eq("id", placeId);
  if (error) return { error: "Nem sikerült a státusz frissítése." };

  revalidatePath("/admin/helyek");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}

export async function adminDeletePlace(placeId: string): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const supabase = createClient();
  const { error } = await supabase.from("places").delete().eq("id", placeId);
  if (error) return { error: "Nem sikerült törölni a helyet." };

  revalidatePath("/admin/helyek");
  revalidatePath("/admin/helyek/osszes");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}

export type AdminPlaceUpdate = {
  name: string;
  category: string;
  city: string;
  address: string;
  phone?: string;
  website?: string;
  description: string;
  whyFriendly: string;
  ownExperience?: string;
  status: string;
};

export async function adminUpdatePlace(
  placeId: string,
  values: AdminPlaceUpdate
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const supabase = createClient();
  const { error } = await supabase
    .from("places")
    .update({
      name: values.name,
      category: values.category,
      city: values.city,
      address: values.address,
      phone: values.phone || null,
      website: values.website || null,
      description: values.description,
      why_friendly: values.whyFriendly,
      own_experience: values.ownExperience || null,
      status: values.status,
    })
    .eq("id", placeId);

  if (error) return { error: "Nem sikerült menteni a helyet." };

  revalidatePath("/admin/helyek");
  revalidatePath("/admin/helyek/osszes");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}
