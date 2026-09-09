// Kedvenc útvonalak — szerver oldali Supabase lekérdezések.
//
// FONTOS: itt SOSEM használunk service-role (admin) klienst — mindig a
// bejelentkezett felhasználó session-jéhez kötött klienst (createClient a
// lib/supabase/server.ts-ből), hogy az RLS policy-k ténylegesen
// érvényesüljenek — ugyanaz a minta, mint lib/rest-points/queries.ts.

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { mapFavoriteRouteRow, type FavoriteRoute, type FavoriteRouteRow } from "@/lib/vedett-route/favorites/types";
import type { FavoriteRouteCreateInput } from "@/lib/vedett-route/favorites/schemas";

// Determinisztikus alapértelmezett név (spec 21. pont: "Ne használj AI-t
// ehhez") — egyszerű "[induló] → [cél]" string-összeállítás. Tiszta,
// oldalhatás-mentes függvény, DB/HTTP nélkül tesztelhető.
export function buildDefaultFavoriteName(input: FavoriteRouteCreateInput): string {
  const originLabel =
    input.originMode === "CURRENT_LOCATION"
      ? "Aktuális helyzetem"
      : input.originManual?.street || input.originManual?.city || "Induló hely";
  const destinationLabel =
    input.destinationMode === "KNOWN_PLACE"
      ? input.destinationKnownPlace?.name ?? "Cél"
      : input.destinationManual?.street || input.destinationManual?.city || "Cél";
  return `${originLabel} → ${destinationLabel}`;
}

// Duplikáció-ellenőrzés (spec 24. pont) — a teljes presetet (origin +
// destination + weights) hasonlítja össze, NEM a nevet (két különböző nevű
// kedvenc is ugyanaz a preset lehet, és épp ezt akarjuk kiszűrni). Tiszta,
// oldalhatás-mentes függvény — a hívó adja át a MÁR lekérdezett saját
// kedvenceket (nincs benne DB-hívás), így egységtesztekkel DB nélkül
// lefedhető.
export function isSameFavoritePreset(a: FavoriteRoute, b: FavoriteRouteCreateInput): boolean {
  if (a.originMode !== b.originMode) return false;
  if (a.originMode === "MANUAL") {
    if (!a.originManual || !b.originManual) return false;
    if (
      a.originManual.city.trim().toLowerCase() !== b.originManual.city.trim().toLowerCase() ||
      a.originManual.districtOrPostalCode.trim().toLowerCase() !== b.originManual.districtOrPostalCode.trim().toLowerCase() ||
      a.originManual.street.trim().toLowerCase() !== b.originManual.street.trim().toLowerCase()
    ) {
      return false;
    }
  }

  if (a.destinationMode !== b.destinationMode) return false;
  if (a.destinationMode === "MANUAL") {
    if (!a.destinationManual || !b.destinationManual) return false;
    if (
      a.destinationManual.city.trim().toLowerCase() !== b.destinationManual.city.trim().toLowerCase() ||
      a.destinationManual.districtOrPostalCode.trim().toLowerCase() !== b.destinationManual.districtOrPostalCode.trim().toLowerCase() ||
      a.destinationManual.street.trim().toLowerCase() !== b.destinationManual.street.trim().toLowerCase()
    ) {
      return false;
    }
  } else {
    if (!a.destinationKnownPlace || !b.destinationKnownPlace) return false;
    if (a.destinationKnownPlace.latitude !== b.destinationKnownPlace.latitude || a.destinationKnownPlace.longitude !== b.destinationKnownPlace.longitude) {
      return false;
    }
  }

  const weightKeys: (keyof FavoriteRoute["weights"])[] = ["transfers", "modeSwitches", "underground", "walking", "duration", "waiting"];
  for (const key of weightKeys) {
    if (a.weights[key] !== b.weights[key]) return false;
  }

  return true;
}

export async function listOwnFavoriteRoutes(): Promise<FavoriteRoute[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("vedett_route_favorites")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    const wrapped = new Error(`Kedvenc útvonalak lekérdezése sikertelen: ${error.message}`);
    (wrapped as Error & { code?: string }).code = error.code;
    throw wrapped;
  }
  return ((data ?? []) as FavoriteRouteRow[]).map(mapFavoriteRouteRow);
}

export async function findDuplicateFavoriteRoute(input: FavoriteRouteCreateInput): Promise<FavoriteRoute | null> {
  const existing = await listOwnFavoriteRoutes();
  return existing.find((favorite) => isSameFavoritePreset(favorite, input)) ?? null;
}

export async function createFavoriteRoute(userId: string, input: FavoriteRouteCreateInput): Promise<FavoriteRoute> {
  const supabase = await createServerSupabase();
  const name = input.name?.trim() || buildDefaultFavoriteName(input);

  const { data, error } = await supabase
    .from("vedett_route_favorites")
    .insert({
      user_id: userId,
      name,
      origin_mode: input.originMode,
      origin_city: input.originMode === "MANUAL" ? input.originManual!.city : null,
      origin_district_or_postal_code: input.originMode === "MANUAL" ? input.originManual!.districtOrPostalCode : null,
      origin_street: input.originMode === "MANUAL" ? input.originManual!.street : null,
      destination_mode: input.destinationMode,
      destination_city: input.destinationMode === "MANUAL" ? input.destinationManual!.city : null,
      destination_district_or_postal_code: input.destinationMode === "MANUAL" ? input.destinationManual!.districtOrPostalCode : null,
      destination_street: input.destinationMode === "MANUAL" ? input.destinationManual!.street : null,
      destination_latitude: input.destinationMode === "KNOWN_PLACE" ? input.destinationKnownPlace!.latitude : null,
      destination_longitude: input.destinationMode === "KNOWN_PLACE" ? input.destinationKnownPlace!.longitude : null,
      destination_label: input.destinationMode === "KNOWN_PLACE" ? input.destinationKnownPlace!.name : null,
      destination_place_id: input.destinationMode === "KNOWN_PLACE" ? input.destinationKnownPlace!.placeId ?? null : null,
      weights: input.weights,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Kedvenc útvonal mentése sikertelen: ${error.message}`);
  return mapFavoriteRouteRow(data as FavoriteRouteRow);
}

export async function renameOwnFavoriteRoute(id: string, name: string): Promise<FavoriteRoute | null> {
  const supabase = await createServerSupabase();
  // Nincs .eq("user_id", userId) — SZÁNDÉKOSAN nem az app kód dönti el a
  // jogosultságot, hanem az RLS policy (vedett_route_favorites_own_update).
  // Ugyanaz a minta, mint lib/rest-points/queries.ts updateOwnRestPoint().
  const { data, error } = await supabase
    .from("vedett_route_favorites")
    .update({ name })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Kedvenc útvonal átnevezése sikertelen: ${error.message}`);
  return data ? mapFavoriteRouteRow(data as FavoriteRouteRow) : null;
}

export async function deleteOwnFavoriteRoute(id: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  // Lásd renameOwnFavoriteRoute megjegyzése — a jogosultságot az RLS dönti el.
  const { data, error } = await supabase.from("vedett_route_favorites").delete().eq("id", id).select("id").maybeSingle();

  if (error) throw new Error(`Kedvenc útvonal törlése sikertelen: ${error.message}`);
  return Boolean(data);
}
