"use server";

// Gyermek utazási állapot írása. A jogosultságot a
// set_child_travel_status() SECURITY DEFINER RPC ellenőrzi (a hívó saját
// aktív gyermekfiókja, saját, mai, aktív napirendi eseménye). Itt csak
// bemenet-validáció és hibaüzenet-leképezés történik. Nincs logolás.
// Sikeres írás után célzott szülői/gondviselői push (lib/family/travelPushServer):
// címzett és duplikáció-védelem a DB-ben; hibája nem érinti az eredményt.

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
import { travelNotifyEventFor } from "@/lib/family/travelNotify";
import { notifyChildTravelEvent } from "@/lib/family/travelPushServer";

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

  const row = data as TravelStatusRow & { id?: unknown };
  const event = travelNotifyEventFor(action, row);
  if (event) {
    try {
      await notifyChildTravelEvent(row.id as string, event);
    } catch {
      // az értesítés hibája nem akadályozhatja az állapot rögzítését
    }
  }

  revalidatePath("/csalad");
  return { ok: true, state: rowToTravelState(row) };
}
