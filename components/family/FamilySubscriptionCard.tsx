// Védett Család — előfizetési állapot és csomag-összehasonlítás (szerver
// komponens, kliens-JS nélkül). Csak tájékoztat: fizetés / próbaidő-indítás
// még nincs bekapcsolva, a gombok letiltott „Hamarosan” állapotúak.

import {
  FAMILY_FEATURE_LABELS,
  FAMILY_PLUS_PRICES,
  formatHuf,
  type SubscriptionView,
} from "@/lib/family/subscriptionView";

export default function FamilySubscriptionCard({ familyName, view }: { familyName: string | null; view: SubscriptionView }) {
  return (
    <section aria-label="Előfizetés" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <h2 className="font-semibold text-gray-900">Előfizetés{familyName ? ` – ${familyName}` : ""}</h2>

      {!view.available ? (
        <p className="mt-2 text-sm text-gray-600">
          Az előfizetési adatok jelenleg nem érhetők el. A családi funkciók ettől függetlenül használhatók.
        </p>
      ) : (
        <div className="mt-2 text-sm text-gray-700">
          <p>
            Jelenlegi csomag: <strong>{view.planLabel}</strong> <span className="text-gray-500">({view.statusLabel})</span>
          </p>
          {view.trial.kind === "active" && <p className="mt-1">Próbaidő vége: {view.trial.endsAt}</p>}
          {view.trial.kind === "used" && <p className="mt-1 text-gray-500">A 14 napos próbaidőt ez a család már felhasználta.</p>}
          {view.periodEndLabel && <p className="mt-1">Az aktuális időszak vége: {view.periodEndLabel}</p>}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["free", "plus"] as const).map((plan) => (
          <div key={plan} className="rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">{plan === "free" ? "Ingyenes" : "Plusz"}</h3>
            {plan === "plus" && (
              <p className="mt-1 text-sm text-gray-700">
                Tervezett díj: {formatHuf(FAMILY_PLUS_PRICES.monthlyHuf)}/hó vagy {formatHuf(FAMILY_PLUS_PRICES.yearlyHuf)}/év családonként
              </p>
            )}
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {FAMILY_FEATURE_LABELS.filter((f) => plan === "plus" || f.plan === "free").map((f) => (
                <li key={f.key}>
                  <span aria-hidden>✓ </span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        A meglévő Védett Család funkciók továbbra is ingyenesen használhatók. Az árak tervezettek; fizetés még nem lehetséges.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {view.available && view.trial.kind === "eligible" && (
          <button type="button" disabled aria-disabled="true" className="cursor-not-allowed rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-400">
            14 napos ingyenes próbaidő – Hamarosan
          </button>
        )}
        <button type="button" disabled aria-disabled="true" className="cursor-not-allowed rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-400">
          Plusz előfizetés – Hamarosan
        </button>
      </div>
    </section>
  );
}
