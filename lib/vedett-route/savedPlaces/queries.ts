// Mentett helyek — szerver oldali Supabase lekérdezések.
//
// FONTOS: SOSEM service-role kliens — mindig a bejelentkezett felhasználó
// session-jéhez kötött kliens, hogy az RLS (user_id = auth.uid()) érvényesüljön.
// A hibaüzenetek SZÁNDÉKOSAN nem tartalmaznak címet/koordinátát (privát adat).

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { mapSavedPlaceRow, type SavedPlace, type SavedPlaceRow } from "@/lib/vedett-route/savedPlaces/types";
import type { SavedPlaceCreateInput } from "@/lib/vedett-route/savedPlaces/schemas";

export class SavedPlacesLimitError extends Error {
  constructor() {
    super("saved_places_limit_reached");
    this.name = "SavedPlacesLimitError";
  }
}

export async function listOwnSavedPlaces(): Promise<SavedPlace[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("saved_places").select("*").order("created_at", { ascending: true });
  if (error) throw new Error("Mentett helyek lekérdezése sikertelen.");
  return ((data ?? []) as SavedPlaceRow[]).map(mapSavedPlaceRow);
}

export async function createSavedPlace(userId: string, input: SavedPlaceCreateInput): Promise<SavedPlace> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("saved_places")
    .insert({
      user_id: userId,
      display_name: input.displayName,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
    })
    .select("*")
    .single();
  if (error) {
    if (typeof error.message === "string" && error.message.includes("saved_places_limit_reached")) {
      throw new SavedPlacesLimitError();
    }
    throw new Error("Mentett hely mentése sikertelen.");
  }
  return mapSavedPlaceRow(data as SavedPlaceRow);
}

// Nincs .eq("user_id") — a jogosultságot az RLS dönti el (lásd favorites minta).
export async function renameOwnSavedPlace(id: string, displayName: string): Promise<SavedPlace | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("saved_places")
    .update({ display_name: displayName })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error("Mentett hely átnevezése sikertelen.");
  return data ? mapSavedPlaceRow(data as SavedPlaceRow) : null;
}

export async function deleteOwnSavedPlace(id: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("saved_places").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw new Error("Mentett hely törlése sikertelen.");
  return Boolean(data);
}
