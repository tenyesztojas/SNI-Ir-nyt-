"use server";

// Gyermek utazási állapot írása. A jogosultságot a
// set_child_travel_status() SECURITY DEFINER RPC ellenőrzi (a hívó saját
// aktív gyermekfiókja, saját, mai, aktív napirendi eseménye). Itt csak
// bemenet-validáció és hibaüzenet-leképezés történik. Nincs logolás.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isTravelAction,
  rowToTravelState,
  travelErrorCode,
  type TravelErrorCode,
  type TravelState,
  type TravelStatusRow,
} from "@/lib/family/travelStatus";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TravelActionResult = { ok: true; state: TravelState } | { ok: false; error: TravelErrorCode };

export async function setTravelStatusAction(scheduleItemId: unknown, action: unknown): Promise<TravelActionResult> {
  if (typeof scheduleItemId !== "string" || !UUID_RE.test(scheduleItemId)) {
    return { ok: false, error: "travel_item_not_found" };
  }
  if (!isTravelAction(action)) return { ok: false, error: "travel_invalid_action" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "travel_not_child" };

  const { data, error } = await supabase.rpc("set_child_travel_status", {
    p_schedule_item_id: scheduleItemId,
    p_action: action,
  });
  if (error || !data) return { ok: false, error: travelErrorCode(error?.message) };

  revalidatePath("/csalad");
  return { ok: true, state: rowToTravelState(data as TravelStatusRow) };
}
