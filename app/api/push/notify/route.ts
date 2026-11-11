import { NextResponse } from "next/server";
import { sendAdminPush } from "@/lib/push";
import { isCurrentUserAdmin } from "@/lib/data";
import { handleAdminNotify } from "@/lib/pushAdminNotify";

// Admin push értesítés: KIZÁRÓLAG bejelentkezett adminnak (lib/pushAdminNotify.ts).
// A programajánló értesítését a szerveroldali beküldés küldi
// (app/programajanlok/actions.ts), nem ez a végpont.
// A rate limitet a middleware (/api/ általános szabály) változatlanul adja.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }

  const res = await handleAdminNotify(raw, { isAdmin: isCurrentUserAdmin, send: sendAdminPush });

  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
