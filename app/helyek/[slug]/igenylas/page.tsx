import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPlaceBySlug, getCurrentUserAndProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import PlaceClaimButton from "@/components/PlaceClaimButton";

export default async function PlaceClaimPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const place = await getPlaceBySlug(params.slug);
  if (!place) notFound();

  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect(`/bejelentkezes?next=/helyek/${params.slug}/igenylas`);

  const adminClient = createAdminClient();

  // Van-e már verified claim ehhez a helyhez?
  const { data: verifiedClaim } = await adminClient
    .from("place_claims")
    .select("id, claimant_user_id")
    .eq("place_id", place.id)
    .eq("status", "verified")
    .maybeSingle();

  const isClaimed = !!verifiedClaim;
  const isOwner = isClaimed && verifiedClaim?.claimant_user_id === user.id;

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <Link href={`/helyek/${params.slug}`} className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza a hely oldalára
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-sni-text">Hely igénylése</h1>
      <p className="mt-2 text-gray-600 text-sm">
        Ha te vagy a(z) <strong>{place.name}</strong> üzemeltetője, igényelheted a helyet.
        Ezután nyilvános választ írhatsz az értékelésekre (ÁSZF 7.5. pont).
      </p>

      <div className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-soft">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Hogyan működik?</h2>
        <ol className="list-decimal pl-4 space-y-2 text-sm text-gray-600">
          <li>Add meg a hely hivatalos e-mail-jét (pl. info@vendeghaz.hu).</li>
          <li>Ha a domain egyezik a weboldaladdal, azonnal megerősítjük.</li>
          <li>Egyébként visszaigazoló e-mailt küldünk arra a címre (72 óra).</li>
          <li>Ezután nyilvános válaszokat írhatsz az értékelésekre.</li>
        </ol>

        <div className="mt-6">
          <PlaceClaimButton
            placeId={place.id}
            isClaimed={isClaimed}
            isOwner={isOwner}
          />
        </div>

        {isClaimed && !isOwner && (
          <p className="mt-4 text-sm text-gray-500">
            Ezt a helyet már egy másik felhasználó igényelte. Ha úgy gondolod, hogy ez tévedés,{" "}
            <Link href="/kapcsolat" className="text-sni-brand-blue hover:underline">vedd fel velünk a kapcsolatot</Link>.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Az igénylés és a visszaigazolás adatait az Adatkezelési Tájékoztató 2.4. pontja alapján kezeljük.
      </p>
    </div>
  );
}
