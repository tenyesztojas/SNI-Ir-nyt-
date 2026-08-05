import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/igenylas-verify?token=<token>
// E-mailben kiküldött visszaigazoló link — token alapú domain ellenőrzés
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Érvénytelen token." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Claim keresése token alapján
  const { data: claim } = await adminClient
    .from("place_claims")
    .select("id, place_id, claimant_user_id, verification_data, status, created_at")
    .eq("verification_token", token)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json({ error: "A token nem található vagy már lejárt." }, { status: 404 });
  }

  if (claim.status !== "pending") {
    return NextResponse.redirect(new URL("/helyek?igenylas=mar-feldolgozva", req.url));
  }

  // Token lejárata: 72 óra
  const created = new Date(claim.created_at);
  const hoursElapsed = (Date.now() - created.getTime()) / 3600000;
  if (hoursElapsed > 72) {
    await adminClient
      .from("place_claims")
      .update({ status: "rejected", reject_reason: "Token lejárt (72 óra)" })
      .eq("id", claim.id);
    return NextResponse.json({ error: "A visszaigazoló link lejárt. Küldj be új igénylést." }, { status: 410 });
  }

  // Domain ellenőrzés: verification_data = businessEmail, az e-mail domainnek
  // egyeznie kell a hely website-jával
  const { data: place } = await adminClient
    .from("places")
    .select("website, slug")
    .eq("id", claim.place_id)
    .single();

  const businessEmail: string = claim.verification_data ?? "";
  const emailDomain = businessEmail.split("@")[1]?.toLowerCase() ?? "";

  let websiteDomain = "";
  if (place?.website) {
    try {
      const url = place.website.startsWith("http") ? place.website : `https://${place.website}`;
      websiteDomain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch { /* ignore */ }
  }

  // Ha nincs website, admin manuálisan hagyja jóvá — átirányítjuk
  if (!websiteDomain) {
    return NextResponse.redirect(new URL(`/helyek/${place?.slug ?? claim.place_id}?igenylas=admin-review`, req.url));
  }

  if (emailDomain !== websiteDomain) {
    await adminClient
      .from("place_claims")
      .update({
        status: "rejected",
        reject_reason: `E-mail domain (${emailDomain}) nem egyezik a hely website domainjével (${websiteDomain})`,
      })
      .eq("id", claim.id);
    return NextResponse.redirect(new URL("/helyek?igenylas=domain-hiba", req.url));
  }

  // Minden stimmel — verified
  await adminClient
    .from("place_claims")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      verification_token: null, // token single-use
    })
    .eq("id", claim.id);

  return NextResponse.redirect(new URL(`/helyek/${place?.slug ?? claim.place_id}?igenylas=sikeres`, req.url));
}
