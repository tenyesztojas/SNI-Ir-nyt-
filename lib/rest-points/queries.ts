// Pihenőpontok — szerver oldali Supabase lekérdezések.
//
// FONTOS: itt SOSEM használunk service-role (admin) klienst — mindig a
// bejelentkezett felhasználó session-jéhez kötött klienst (createClient a
// lib/supabase/server.ts-ből), hogy az RLS policy-k ténylegesen
// érvényesüljenek. Ez a lényege annak, hogy a cross-user hozzáférés a
// DATABASE szinten (nem csak az app kódban) legyen tiltva.

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { mapRestPointRow, type RestPoint, type RestPointRow } from "./types";
import type { RestPointCreateInput, RestPointUpdateInput } from "./schemas";

export async function listOwnRestPoints(): Promise<RestPoint[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("rest_points")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    // Sprint E.1 hotfix (2026-09-09) — a Postgrest/Postgres hibakódot
    // (error.code, pl. "42P01" = undefined_table, "42501" =
    // insufficient_privilege) a dobott Error-on is megőrizzük, hogy a
    // hívó (userProvider.ts) admin/preview debug célra pontosan
    // osztályozni tudja a hiba okát — koordinátát/userId-t/secretet ez a
    // mező SOSEM tartalmaz, csak egy zárt, gépi kódot.
    const wrapped = new Error(`Pihenőpontok lekérdezése sikertelen: ${error.message}`);
    (wrapped as Error & { code?: string }).code = error.code;
    throw wrapped;
  }
  return ((data ?? []) as RestPointRow[]).map(mapRestPointRow);
}

export async function createRestPoint(userId: string, input: RestPointCreateInput): Promise<RestPoint> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("rest_points")
    .insert({
      created_by: userId,
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      source: "USER",
      visibility: "PRIVATE",
      toilet: input.toilet ?? null,
      seating: input.seating ?? null,
      quiet_space: input.quietSpace ?? null,
      indoors: input.indoors ?? null,
      outdoors: input.outdoors ?? null,
      purchase_required: input.purchaseRequired ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Pihenőpont mentése sikertelen: ${error.message}`);
  return mapRestPointRow(data as RestPointRow);
}

export async function updateOwnRestPoint(id: string, input: RestPointUpdateInput): Promise<RestPoint | null> {
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.latitude !== undefined) patch.latitude = input.latitude;
  if (input.longitude !== undefined) patch.longitude = input.longitude;
  if (input.toilet !== undefined) patch.toilet = input.toilet;
  if (input.seating !== undefined) patch.seating = input.seating;
  if (input.quietSpace !== undefined) patch.quiet_space = input.quietSpace;
  if (input.indoors !== undefined) patch.indoors = input.indoors;
  if (input.outdoors !== undefined) patch.outdoors = input.outdoors;
  if (input.purchaseRequired !== undefined) patch.purchase_required = input.purchaseRequired;
  if (input.notes !== undefined) patch.notes = input.notes;

  // Nincs .eq("created_by", userId) — SZÁNDÉKOSAN nem az app kód dönti el a
  // jogosultságot, hanem az RLS policy (rest_points_own_update). Ha a sor
  // nem a hívóé, az UPDATE nulla sort érint (nem hibát dob), ezért a
  // hívó oldalon a null visszatérési érték jelzi "nem található / nem a tiéd".
  const { data, error } = await supabase.from("rest_points").update(patch).eq("id", id).select("*").maybeSingle();

  if (error) throw new Error(`Pihenőpont frissítése sikertelen: ${error.message}`);
  return data ? mapRestPointRow(data as RestPointRow) : null;
}

export async function deleteOwnRestPoint(id: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  // Lásd updateOwnRestPoint megjegyzése — a jogosultságot az RLS dönti el.
  const { data, error } = await supabase.from("rest_points").delete().eq("id", id).select("id").maybeSingle();

  if (error) throw new Error(`Pihenőpont törlése sikertelen: ${error.message}`);
  return Boolean(data);
}
