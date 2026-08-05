import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlaceClaim } from "@/lib/types";
import AdminClaimsManager from "@/components/AdminClaimsManager";

export default async function AdminClaimsPage() {
  const adminClient = createAdminClient();

  const { data: rawClaims } = await adminClient
    .from("place_claims")
    .select("id, place_id, claimant_user_id, verification_method, verification_data, status, reject_reason, created_at, verified_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const placeIds = [...new Set((rawClaims ?? []).map((c) => c.place_id))];
  const { data: places } = await adminClient
    .from("places")
    .select("id, name, slug")
    .in("id", placeIds);

  const placeById = new Map((places ?? []).map((p) => [p.id, p]));

  const claims: PlaceClaim[] = (rawClaims ?? []).map((c) => ({
    id: c.id,
    placeId: c.place_id,
    claimantUserId: c.claimant_user_id,
    verificationMethod: c.verification_method,
    verificationData: c.verification_data,
    status: c.status,
    rejectReason: c.reject_reason,
    createdAt: c.created_at,
    verifiedAt: c.verified_at,
    placeName: placeById.get(c.place_id)?.name,
    placeSlug: placeById.get(c.place_id)?.slug,
  }));

  const pending = claims.filter((c) => c.status === "pending");
  const others = claims.filter((c) => c.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Hely-igénylések</h1>
      <p className="mt-2 text-sm text-gray-600">
        Email-token alapú igénylések, amelyek nem tudtak automatikusan megerősíteni (domain nem egyezik).
      </p>

      {claims.length === 0 ? (
        <p className="mt-8 text-center text-gray-500">Nincs igénylés.</p>
      ) : (
        <AdminClaimsManager pending={pending} others={others} />
      )}
    </div>
  );
}
