"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newPlaceSchema, NewPlaceInput } from "@/lib/schemas";
import { slugify, randomSuffix } from "@/lib/slugify";
import { isCurrentUserAdmin } from "@/lib/data";
import { autoModeratePlace } from "@/lib/autoModerate";
import { sendAdminPush } from "@/lib/push";

// --- Google Maps Geocoding ---
async function geocodeAddress(address: string, city: string, country = "Magyarország"): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const query = encodeURIComponent(`${address}, ${city}, ${country}`);
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

  // Automatikus technikai ellenőrzés (ÁSZF 3. pont — kizárólag formai/technikai szempontok)
  const modResult = autoModeratePlace({
    name: data.name,
    description: data.description,
    whyFriendly: data.whyFriendly,
  });
  if (!modResult.pass) {
    return {
      error: "A hely-javaslat automatikus technikai ellenőrzésen nem ment át: " + modResult.reason,
    };
  }

  // Geocoding
  const geo = await geocodeAddress(data.address, data.city, data.country ?? "Magyarország");

  const adminClient = createAdminClient();
  const baseSlug = slugify(data.name) || "hely";
  let slug = baseSlug;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await adminClient.from("places").insert({
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
      country: data.country ?? "Magyarország",
      status: "published",
      source: "user_suggested",
      flagged_for_review: modResult.flagged,
      created_by: user.id,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
    });

    if (!error) {
      revalidatePath("/helyek");
      revalidatePath("/profil");
      if (modResult.flagged) {
        await sendAdminPush("Megjelölt hely közzétéve", `${data.name} — automatikusan közzétéve, gyanús mintázat`, "/admin/jelzesek");
      }
      return {};
    }

    if (error.code === "23505") {
      slug = `${baseSlug}-${randomSuffix()}`;
      continue;
    }

    return { error: "Nem sikerült a hely beküldése. Próbáld újra." };
  }

  return { error: "Nem sikerült a hely beküldése (slug ütközés)." };
}


// removePlace — UTÓLAGOS, bejelentés-alapú eltávolítás (ÁSZF 7. pont)
// Előzetes jóváhagyási funkció szándékosan el lett távolítva (ÁSZF 3. pont).
export async function removePlace(
  placeId: string,
  reportId: string | null,
  reason: string
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const admin = createAdminClient();
  const supabase = createClient();

  const { error } = await admin.from("places").update({ status: "removed" }).eq("id", placeId);
  if (error) return { error: "Nem sikerült eltávolítani." };

  // Audit log
  const { data: userData } = await supabase.auth.getUser();
  await admin.from("moderation_log").insert({
    content_type: "place",
    content_id: placeId,
    admin_id: userData.user?.id,
    report_id: reportId,
    action: "removed",
    reason,
  });

  if (reportId) {
    await admin.from("reports").update({ status: "resolved" }).eq("id", reportId);
  }

  revalidatePath("/admin/jelzesek");
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
    .eq("status", "published")
    .ilike("name", `%${query.trim()}%`)
    .limit(4);
  return data ?? [];
}

export type AdminCreatePlaceInput = {
  name: string;
  category: string;
  city: string;
  country?: string;
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

  const geo = await geocodeAddress(input.address, input.city, input.country ?? "Magyarország");

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin.from("places").insert({
      slug,
      name: input.name.trim(),
      category: input.category,
      city: input.city,
      country: input.country ?? "Magyarország",
      address: input.address,
      phone: input.phone || null,
      website: input.website || null,
      description: input.description,
      why_friendly: input.whyFriendly,
      own_experience: input.ownExperience || null,
      images: images.length > 0 ? images : null,
      status: "published",
      source: "admin",
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
  country?: string;
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
  images?: string[] | null;
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
      country: values.country ?? "Magyarország",
      address: values.address,
      phone: values.phone || null,
      website: values.website || null,
      description: values.description,
      why_friendly: values.whyFriendly,
      own_experience: values.ownExperience || null,
      status: values.status,
      latitude: lat,
      longitude: lng,
      ...(values.images !== undefined ? { images: values.images } : {}),
    })
    .eq("id", placeId);

  if (error) return { error: "Nem sikerült menteni a helyet. (" + error.message + ")" };

  revalidatePath("/admin/helyek");
  revalidatePath("/admin/helyek/osszes");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}

export async function adminEditAndApprovePlace(
  placeId: string,
  fields: { name: string; description: string; whyFriendly: string; ownExperience?: string }
): Promise<{ error?: string }> {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return { error: "Nincs jogosultságod ehhez a művelethez." };

  const admin = createAdminClient();

  // Geocoding ha még nincs koordináta
  const { data: existing } = await admin
    .from("places")
    .select("address, city, latitude")
    .eq("id", placeId)
    .single();

  let coords: Record<string, unknown> = {};
  if (existing && !existing.latitude && existing.address && existing.city) {
    const geo = await geocodeAddress(existing.address, existing.city, (existing as { country?: string }).country ?? "Magyarország");
    if (geo) coords = { latitude: geo.lat, longitude: geo.lng };
  }

  const { error } = await admin
    .from("places")
    .update({
      name: fields.name,
      description: fields.description,
      why_friendly: fields.whyFriendly,
      own_experience: fields.ownExperience || null,
      // status szándékosan NEM módosul — adminEditAndApprovePlace nem jóváhagyási funkció
      ...coords,
    })
    .eq("id", placeId);

  if (error) return { error: "Nem sikerült menteni. (" + error.message + ")" };

  revalidatePath("/admin/helyek");
  revalidatePath("/helyek");
  revalidatePath("/");
  return {};
}
