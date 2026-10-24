// Szülői/gondviselői élő frissítés: gyermekenként a legfrissebb utazási
// jelzés. Csak bejelentkezett felhasználónak; a láthatóságot a
// child_travel_statuses SELECT RLS-policy dönti el (idegen gyermek sora
// nem jön vissza). Nincs logolás, nincs gyorsítótárazás.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecentTravelStatuses } from "@/lib/family/travelStatusData";
import { latestTravelByChild, parseChildIds } from "@/lib/family/travelStatus";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });

  const childIds = parseChildIds(new URL(request.url).searchParams.get("children"));
  if (!childIds) return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });

  const res = await fetchRecentTravelStatuses(childIds);
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });

  return NextResponse.json(
    {
      ok: true,
      // Csak a megjelenítéshez szükséges mezők (nincs schedule_item_id).
      statuses: Object.fromEntries(
        Array.from(latestTravelByChild(res.rows), ([childId, r]) => [
          childId,
          {
            child_id: r.child_id,
            travel_date: r.travel_date,
            status: r.status,
            departed_at: r.departed_at,
            arrived_at: r.arrived_at,
            help_requested_at: r.help_requested_at,
            updated_at: r.updated_at,
            title: r.title,
          },
        ])
      ),
    },
    { headers: NO_STORE }
  );
}
