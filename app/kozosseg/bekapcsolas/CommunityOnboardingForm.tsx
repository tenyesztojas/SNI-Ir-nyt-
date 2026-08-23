"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCommunityProfile } from "@/app/kozosseg/actions";
import {
  ROLE_LABELS,
  CONNECTION_GOAL_OPTIONS,
  NEURODIVERGENCE_OPTIONS,
  CHILD_AGE_OPTIONS,
  type CommunityRole,
} from "@/lib/community/types";
import { AlertTriangle } from "lucide-react";

const STEP_COUNT = 5;

export default function CommunityOnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<CommunityRole>("szulo");
  const [introText, setIntroText] = useState("");
  const [county, setCounty] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [mapEnabled, setMapEnabled] = useState(true);
  const [goals, setGoals] = useState<string[]>([]);
  const [neurodivergence, setNeurodivergence] = useState<string[]>([]);
  const [childAgeGroup, setChildAgeGroup] = useState<string[]>([]);
  const [acceptsRequests, setAcceptsRequests] = useState(true);
  const [acceptsMessage, setAcceptsMessage] = useState<"anyone" | "connection" | "nobody">("connection");
  const [pushEnabled, setPushEnabled] = useState(true);

  function toggleArr(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  async function handleSubmit() {
    if (!displayName.trim()) { setError("A megjelenített név kötelező."); return; }
    setSaving(true);
    setError(null);
    const result = await upsertCommunityProfile({
      display_name: displayName.trim(),
      role,
      intro_text: introText,
      county,
      city,
      district,
      map_display_enabled: mapEnabled,
      connection_goals: goals,
      neurodivergence_tags: neurodivergence,
      child_age_group: role === "szulo" ? childAgeGroup : [],
      accepts_friend_requests: acceptsRequests,
      accepts_first_message: acceptsMessage,
      push_friend_requests: pushEnabled,
      push_messages: pushEnabled,
      push_connection_accepted: pushEnabled,
      profile_visibility: "active",
    });
    setSaving(false);
    if (!result.ok) { setError(result.error ?? "Hiba történt."); return; }
    router.push("/kozosseg/profilom?uj=1");
  }

  const isBudapest = city.toLowerCase().includes("budapest");

  return (
    <div className="space-y-8">
      {/* Lépésjelző */}
      <div className="flex gap-1.5">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i + 1 <= step ? "bg-sni-brand-teal" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">{step}. lépés / {STEP_COUNT}</p>

      {/* STEP 1: Alapadatok */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="font-bold text-sni-text text-lg">Alap profiladatok</h2>

          <div>
            <label className="label-field">Megjelenített név vagy becenév *</label>
            <input
              className="input-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="pl. Kati"
              maxLength={60}
            />
          </div>

          <div>
            <label className="label-field">Szerepkör *</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.entries(ROLE_LABELS) as [CommunityRole, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRole(val)}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${
                    role === val
                      ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal"
                      : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label-field">Rövid bemutatkozás (opcionális)</label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              placeholder="Néhány sor rólad — csak amit biztonságosan megosztanál."
              maxLength={400}
            />
          </div>
        </div>
      )}

      {/* STEP 2: Helyadatok */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="font-bold text-sni-text text-lg">Helyadatok</h2>
          <p className="text-sm text-gray-500">
            A térképen csak város vagy kerület szinten jelensz meg — pontos cím nem látható.
          </p>

          <div>
            <label className="label-field">Vármegye</label>
            <input className="input-field" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="pl. Pest" />
          </div>
          <div>
            <label className="label-field">Település *</label>
            <input className="input-field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="pl. Budapest" required />
          </div>
          {isBudapest && (
            <div>
              <label className="label-field">Budapest kerület (opcionális)</label>
              <input className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="pl. VII." />
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <input
              type="checkbox"
              checked={mapEnabled}
              onChange={(e) => setMapEnabled(e.target.checked)}
              className="h-4 w-4 accent-sni-brand-teal"
            />
            <span className="text-sm text-gray-700">
              Megjelenhetek a közösségi térképen (város/kerület szinten)
            </span>
          </label>
        </div>
      )}

      {/* STEP 3: Kapcsolódási célok */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-bold text-sni-text text-lg">Kapcsolódási célok</h2>
          <p className="text-sm text-gray-500">Válaszd ki, mire vagy nyitott (több is választható).</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONNECTION_GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleArr(goals, setGoals, opt.value)}
                className={`rounded-xl border px-4 py-2.5 text-sm text-left transition ${
                  goals.includes(opt.value)
                    ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium"
                    : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Érintettség */}
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
            <p className="text-sm font-semibold text-gray-700">Érintettség (opcionális)</p>
            <p className="mt-0.5 text-xs text-gray-500">Csak akkor jelöld, ha szívesen megosztod más tagokkal.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {NEURODIVERGENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleArr(neurodivergence, setNeurodivergence, opt.value)}
                  className={`rounded-xl border px-3 py-2 text-sm text-left transition ${
                    neurodivergence.includes(opt.value)
                      ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium"
                      : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Életkori sáv — csak szülőknél */}
          {role === "szulo" && (
            <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
              <p className="text-sm font-semibold text-gray-700">Gyermek életkori sávja (opcionális)</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CHILD_AGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleArr(childAgeGroup, setChildAgeGroup, opt.value)}
                    className={`rounded-xl border px-3 py-2 text-sm text-left transition ${
                      childAgeGroup.includes(opt.value)
                        ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium"
                        : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Üzenet- és jelölés-beállítások */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-bold text-sni-text text-lg">Kapcsolódási beállítások</h2>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <input
              type="checkbox"
              checked={acceptsRequests}
              onChange={(e) => setAcceptsRequests(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-sni-brand-teal"
            />
            <span className="text-sm text-gray-700">Fogadok kapcsolódási kéréseket</span>
          </label>

          <div>
            <label className="label-field">Ki írhat nekem üzenetet?</label>
            <div className="mt-2 space-y-2">
              {[
                { val: "anyone", label: "Bárki a közösségen belül" },
                { val: "connection", label: "Csak elfogadott kapcsolataim" },
                { val: "nobody", label: "Senki (üzenetek kikapcsolva)" },
              ].map((opt) => (
                <label key={opt.val} className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="accepts_message"
                    value={opt.val}
                    checked={acceptsMessage === opt.val}
                    onChange={() => setAcceptsMessage(opt.val as typeof acceptsMessage)}
                    className="accent-sni-brand-teal"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => setPushEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-sni-brand-teal"
            />
            <div>
              <p className="text-sm text-gray-700 font-medium">Push értesítések engedélyezése</p>
              <p className="text-xs text-gray-400 mt-0.5">Új jelölésről, elfogadott kérésről és üzenetekről.</p>
            </div>
          </label>
        </div>
      )}

      {/* STEP 5: Összefoglaló előnézet */}
      {step === 5 && (
        <div className="space-y-4">
          <h2 className="font-bold text-sni-text text-lg">Profil előnézet</h2>
          <p className="text-sm text-gray-500">Így fognak látni más közösségi tagok.</p>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-soft space-y-2">
            <p className="text-lg font-bold text-sni-text">{displayName || "—"}</p>
            <p className="text-sm text-gray-500">{ROLE_LABELS[role]}</p>
            {(city || district) && (
              <p className="text-sm text-gray-500">{city}{district ? `, ${district} kerület` : ""}</p>
            )}
            {introText && <p className="text-sm text-gray-700 mt-2">{introText}</p>}
            {goals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {goals.map((g) => (
                  <span key={g} className="rounded-full bg-sni-brand-teal/10 px-2.5 py-0.5 text-xs text-sni-brand-teal font-medium">
                    {CONNECTION_GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            A profil admin jóváhagyás után jelenik meg nyilvánosan.
          </div>
        </div>
      )}

      {/* Hibaüzenet */}
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Navigáció */}
      <div className="flex justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="btn-secondary"
          >
            Vissza
          </button>
        ) : (
          <div />
        )}
        {step < STEP_COUNT ? (
          <button
            type="button"
            onClick={() => {
              if (step === 1 && !displayName.trim()) { setError("A megjelenített név kötelező."); return; }
              if (step === 2 && !city.trim()) { setError("A település megadása kötelező."); return; }
              setError(null);
              setStep((s) => s + 1);
            }}
            className="btn-primary"
          >
            Tovább
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? "Mentés..." : "Profil létrehozása"}
          </button>
        )}
      </div>
    </div>
  );
}
