import { NextResponse } from "next/server";
import { getApprovedPlaces } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const places = await getApprovedPlaces();
  return NextResponse.json({
    count: places.length,
    order: places.map((p, i) => `${i + 1}. ${p.name}`),
  });
}
