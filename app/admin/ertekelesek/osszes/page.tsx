import Link from "next/link";
import { isCurrentUserAdmin, getAllReviewsLog } from "@/lib/data";
import { redirect } from "next/navigation";
import { Star, User, Clock, AlertTriangle } from "lucide-react";

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1,2,3,4,5].map((i) => (
        <span key={i} className={i <= n ? "text-amber-400" : "text-gray-200"}>★</span>
      ))}
    </span>
  );
}

export default async function AdminAllReviewsPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  const reviews = await getAllReviewsLog();
  const flaggedCount = reviews.filter((r) => r.flagged).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold text-sni-text">
          Összes értékelés ({reviews.length})
        </h1>
        <div className="flex gap-3 text-sm">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 font-medium">
            {reviews.length - flaggedCount} normál
          </span>
          {flaggedCount > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 font-medium">
              {flaggedCount} megjelölt
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Ki mit értékelt és mikor — időrendben visszafelé.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Értékelés</th>
              <th className="px-4 py-3">Hely</th>
              <th className="px-4 py-3">Értékelő</th>
              <th className="px-4 py-3">Összpontszám</th>
              <th className="px-4 py-3">Dátum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {reviews.map((r) => (
              <tr key={r.id} className={`hover:bg-gray-50/50 transition-colors ${r.flagged ? "bg-amber-50/30" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {r.flagged && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                    <span className="font-medium text-gray-800 line-clamp-1">{r.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/helyek/${r.placeSlug}`}
                    className="text-sni-brand-blue hover:underline"
                  >
                    {r.placeName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <User size={13} className="text-gray-400" />
                    {r.authorName}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Stars n={r.overallRating} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock size={12} />
                    {new Date(r.createdAt).toLocaleDateString("hu-HU", {
                      year: "numeric", month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reviews.length === 0 && (
          <p className="py-12 text-center text-gray-400">Még nincs értékelés.</p>
        )}
      </div>
    </div>
  );
}
