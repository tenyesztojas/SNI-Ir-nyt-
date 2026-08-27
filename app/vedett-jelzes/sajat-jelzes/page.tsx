import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getMySignal } from "@/lib/vedett-jelzes/data";
import SajatJelzesForm from "./SajatJelzesForm";

export const metadata = {
  title: "Saját Védett Jelzésem – VédettSarok",
};

export const dynamic = "force-dynamic";

export default async function SajatJelzesPage({
  searchParams,
}: {
  searchParams: { mentve?: string };
}) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes?next=/vedett-jelzes/sajat-jelzes");

  const signal = await getMySignal();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <a href="/vedett-jelzes" className="text-sm text-sni-brand-blue hover:underline">
        ← Védett Jelzés
      </a>

      <h1 className="mt-3 text-2xl font-extrabold text-sni-brand-navy">
        Saját Védett Jelzésem
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Töltsd ki az adataidat — ez jelenik meg a digitális kártyádon és a fizikai termékeken.
      </p>

      {searchParams.mentve === "1" && (
        <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">
          ✓ Jelzésed sikeresen mentve!
        </div>
      )}

      <div className="mt-8">
        <SajatJelzesForm signal={signal} />
      </div>

      {signal && (
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/vedett-jelzes/sajat-jelzes/kijelzes"
            className="inline-flex items-center gap-2 rounded-full bg-sni-brand-navy px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
          >
            Teljes képernyős megjelenítés →
          </a>
        </div>
      )}
    </main>
  );
}
