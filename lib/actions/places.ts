"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newPlaceSchema, NewPlaceInput } from "@/lib/schemas";
import { slugify, randomSuffix } from "@/lib/slugify";
import { isCurrentUserAdmin } from "@/lib/data";
import { sendAdminPush } from "@/lib/push";

// --- Google Maps Geocoding ---
async function geocodeAddress(address: string, city: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const query = encodeURIComponent(`${address}, ${city}, Magyarország`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}&language=hu`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (json.status === "OK" && json.results?.[0]) {
      const loc = json.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    console.warn("Geocoding sikertelen:", json.status, address, city);
    return null;
  } catch (err) {
    console.error("Geocoding hiba:", err);
    return null;
  }
}

export async function submitPlace(input: NewPlaceInput, images: string[] = []): Promise<{ error?: string }> {
  const parsed = newPlaceSchema.safeParse(input);
  if (!parsed.success) return { error: "Hibás vagy hiányos adatok." };
  const data = parsed.data;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "A hely beküldéséhez be kell jelentkezned." };

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
      await sendAdminPush(
        "Uj hely bekuldes",
        `${data.name} - ${data.city}`,
        "/admin/helyek"
      );
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

  const admin = createAdminClient();

  // Ha jóváhagyás: geocoding, ha még nincs koordináta
  let coords: { latitude: number; longitude: number } | Record<string, never> = {};
  if (decision === "approved") {
    const { data: place } = await admin
      .from("places")
      .select("address, city, latitude, longitude")
      .eq("id", placeId)
      .single();

    if (place && !place.latitude && place.address && place.city) {
      const geo = await geocodeAddress(place.address, place.city);
      if (geo) {
        coords = { latitude: geo.lat, longitude: geo.lng };
      }
    }
  }

  const { error } = await admin
    .from("places")
    .update({ status: decision, ...coords })
    .eq("id", placeId);

  if (error) return { error: "Nem sikerült a státusz frissítése." };

  revalidatePath("/admin/helyek");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}

export async function adminDeletePlace(placeId: string): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const admin = createAdminClient();

  // Kapcsolódó rekordok törlése (foreign key constraint miatt)
  await admin.from("reviews").delete().eq("place_id", placeId);
  await admin.from("favorites").delete().eq("place_id", placeId);
  await admin.from("reports").delete().eq("place_id", placeId);

  // Maga a hely törlése
  const { error } = await admin.from("places").delete().eq("id", placeId);
  if (error) return { error: "Nem sikerült törölni a helyet. (" + error.message + ")" };

  revalidatePath("/admin/helyek");
  revalidatePath("/admin/helyek/osszes");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}

export async function searchPlacesByName(
  query: string
): Promise<Array<{ id: string; name: string; city: string; slug: string }>> {
  if (!query || query.trim().length < 3) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("places")
    .select("id, name, city, slug")
    .eq("status", "approved")
    .ilike("name", `%${query.trim()}%`)
    .limit(4);
  return data ?? [];
}

export type AdminCreatePlaceInput = {
  name: string;
  category: string;
  city: string;
  address: string;
  phone?: string;
  website?: string;
  description: string;
  whyFriendly: string;
  ownExperience?: string;
};

export async function adminCreatePlace(
  input: AdminCreatePlaceInput,
  images: string[] = []
): Promise<{ error?: string; slug?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  if (!input.name || input.name.length < 2) return { error: "Add meg a hely nevét." };
  if (!input.category) return { error: "Válassz kategóriát." };
  if (!input.city || input.city.length < 2) return { error: "Add meg a települést." };
  if (!input.address || input.address.length < 3) return { error: "Add meg a pontos címet." };
  if (!input.description || input.description.length < 5) return { error: "Adj meg egy leírást." };
  if (!input.whyFriendly || input.whyFriendly.length < 5) return { error: "Írd le, miért autizmus/SNI-barát." };

  const admin = createAdminClient();
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  const baseSlug = slugify(input.name.trim()) || "hely";
  let slug = baseSlug;

  const geo = await geocodeAddress(input.address, input.city);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin.from("places").insert({
      slug,
      name: input.name.trim(),
      category: input.category,
      city: input.city,
      address: input.address,
      phone: input.phone || null,
      website: input.website || null,
      description: input.description,
      why_friendly: input.whyFriendly,
      own_experience: input.ownExperience || null,
      images: images.length > 0 ? images : null,
      status: "approved",
      created_by: userData.user?.id ?? null,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
    });

    if (!error) {
      revalidatePath("/admin/helyek");
      revalidatePath("/admin/helyek/osszes");
      revalidatePath("/helyek");
      revalidatePath("/");
      return { slug };
    }

    if (error.code === "23505") {
      slug = `${baseSlug}-${randomSuffix()}`;
      continue;
    }

    return { error: "Nem sikerült létrehozni a helyet. (" + error.message + ")" };
  }

  return { error: "Nem sikerült létrehozni a helyet." };
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
  latitude?: string;
  longitude?: string;
  regeocode?: boolean;
};

export async function adminUpdatePlace(
  placeId: string,
  values: AdminPlaceUpdate
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const admin = createAdminClient();

  let lat: number | null = values.latitude ? parseFloat(values.latitude) : null;
  let lng: number | null = values.longitude ? parseFloat(values.longitude) : null;

  if (values.regeocode && values.address && values.city) {
    const geo = await geocodeAddress(values.address, values.city);
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }

  const { error } = await admin
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
      latitude: lat,
      longitude: lng,
    })
    .eq("id", placeId);

  if (error) return { error: "Nem sikerült menteni a helyet. (" + error.message + ")" };

  revalidatePath("/admin/helyek");
  revalidatePath("/admin/helyek/osszes");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}
