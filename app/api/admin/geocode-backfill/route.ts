import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function geocode(city: string, district?: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = district
      ? `${district} kerület, ${city}, Magyarország`
      : `${city}, Magyarország`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=hu&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VedettSarok/1.0 (holvay.csaba@gmail.com)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* silent */ }
  return null;
}

export async function POST() {
  const admin = await isCurrentUserAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = createAdminClient();

  // Koordináta nélküli, várossal rendelkező profilok
  const { data: profiles } = await supabase
    .from("community_profiles")
    .select("id, city, district")
    .is("approximate_lat", null)
    .not("city", "is", null);

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ updated: 0, message: "Nincs backfillelhető profil." });
  }

  let updated = 0;
  for (const p of profiles) {
    const coords = await geocode(p.city, p.district ?? undefined);
    if (coords) {
      await supabase
        .from("community_profiles")
        .update({ approximate_lat: coords.lat, approximate_lng: coords.lng })
        .eq("id", p.id);
      updated++;
      // Nominatim rate limit: max 1 req/sec
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  return NextResponse.json({ updated, total: profiles.length });
}
