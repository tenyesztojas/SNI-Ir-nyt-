// Utazási állapotok olvasása — a felhasználó saját sessionjével, az RLS
// (child_travel_statuses_select_via_family) szűr. Hiba (pl. a migráció még
// nincs alkalmazva) esetén üres eredmény: a meglévő felület változatlan.

import { createClient } from "@/lib/supabase/server";
import { previousDate, type TravelStatusRow } from "@/lib/family/travelStatus";
import { budapestLocalDay } from "@/lib/family/todaySchedule";

const COLUMNS =
  "child_id, schedule_item_id, travel_date, status, departed_at, arrived_at, help_requested_at, updated_at";

// Gyermekoldal: a mai és a tegnapi sorok (éjfélen átnyúló, nyitott út miatt).
export async function getChildTravelStatusesForDates(childId: string, dates: string[]): Promise<TravelStatusRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("child_travel_statuses")
    .select(COLUMNS)
    .eq("child_id", childId)
    .in("travel_date", dates);
  if (error || !data) return [];
  return data as TravelStatusRow[];
}

export type TravelStatusWithTitle = TravelStatusRow & { title: string | null };

export async function getChildTravelStatusesForDate(childId: string, date: string): Promise<TravelStatusRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("child_travel_statuses")
    .select(COLUMNS)
    .eq("child_id", childId)
    .eq("travel_date", date);
  if (error || !data) return [];
  return data as TravelStatusRow[];
}

export async function getRecentTravelStatuses(childIds: string[]): Promise<TravelStatusWithTitle[]> {
  const res = await fetchRecentTravelStatuses(childIds);
  return res.ok ? res.rows : [];
}

// Hibát is jelző változat (élő frissítéshez): hiba esetén ok=false, és a
// hívó a korábbi állapotot tartja meg — sosem mutat hamis állapotot.
export async function fetchRecentTravelStatuses(
  childIds: string[]
): Promise<{ ok: true; rows: TravelStatusWithTitle[] } | { ok: false }> {
  if (childIds.length === 0) return { ok: true, rows: [] };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("child_travel_statuses")
    .select(`${COLUMNS}, child_schedule_items(title)`)
    .in("child_id", childIds)
    // Csak a tegnapi és mai utak (adatminimalizálás; a régi lezárt utak nem
    // jelennek meg „legutóbbi” állapotként). Az ablakon belül gyermekenként
    // néhány sor keletkezik, így a limit többgyermekes családnál sem vágja
    // le egy gyermek legfrissebb sorát.
    .gte("travel_date", previousDate(budapestLocalDay(new Date()).date))
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error || !data) return { ok: false };
  const rows = (data as unknown as Array<TravelStatusRow & { child_schedule_items: { title: string } | { title: string }[] | null }>).map(
    (r) => {
      const rel = Array.isArray(r.child_schedule_items) ? r.child_schedule_items[0] : r.child_schedule_items;
      const { child_schedule_items: _omit, ...rest } = r;
      void _omit;
      return { ...rest, title: rel?.title ?? null };
    }
  );
  return { ok: true, rows };
}
