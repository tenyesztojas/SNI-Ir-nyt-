import { NextResponse } from "next/server";
import { sendAdminPush } from "@/lib/push";

// Called server-side only (from server actions or internal API calls)
// Not exposed publicly - only used for program submissions from client
export async function POST(request: Request) {
  const { title, body, url } = await request.json() as {
    title: string;
    body: string;
    url?: string;
  };

  await sendAdminPush(title, body, url ?? "/admin");
  return NextResponse.json({ ok: true });
}
