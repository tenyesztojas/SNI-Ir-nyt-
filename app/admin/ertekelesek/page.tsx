import Link from "next/link";
import { getPendingReviews, getVisiblePlaces } from "@/lib/data";

export default async function AdminReviewsPage() {
  const [flagged, places] = await Promise.all([getPendingReviews(), getVisiblePlaces()]);
  const placeNameById: Record<string, string> = {};
  for (const p of places) placeNameById[p.id] = p.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Megjelölt értékelések</h1>
      <p className="mt-2 text-sm text-gray-600">
        Automatikusan közzétett, gyanús mintázat miatt megjelölt értékelések.
        Ezek már nyilvánosak. Eltávolítás csak bejelentés alapján, utólag lehetséges (ÁSZF 7. pont).
      </p>
      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Jogi megjegyzés:</strong> Az értékelések előzetes, tartalmi alapú jóváhagyása
        jogilag tilos (ÁSZF 3. pont, DSA 6. cikk). Az értékelések automatikusan kerültek közzétételre.
        Emberi beavatkozás kizárólag bejelentett jogsértés esetén, utólag lehetséges.
      </div>
      {flagged.length === 0 ? (
        <p className="mt-8 text-center text-gray-500">Nincs megjelölt értékelés.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {flagged.map((r) => (
            <div key={r.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500">{placeNameById[r.placeId] ?? r.placeId} · {r.authorName}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-700">{r.positiveText}</p>
              <p className="mt-2 text-xs text-amber-700">
                Megjelölés oka: {r.flagReason ?? "ismeretlen"}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Eltávolítás a Bejelentések oldalon, bejelentés alapján lehetséges.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
