"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  upsertCommunityProfile,
  setCommunityProfileVisibility,
} from "@/app/kozosseg/actions";
import {
  ROLE_LABELS,
  CONNECTION_GOAL_OPTIONS,
  NEURODIVERGENCE_OPTIONS,
  CHILD_AGE_OPTIONS,
  type CommunityProfile,
  type CommunityRole,
} from "@/lib/community/types";

export default function ProfileEditForm({ profile }: { profile: CommunityProfile }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [role, setRole] = useState<CommunityRole>(profile.role);
  const [introText, setIntroText] = useState(profile.intro_text ?? "");
  const [county, setCounty] = useState(profile.county ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [district, setDistrict] = useState(profile.district ?? "");
  const [mapEnabled, setMapEnabled] = useState(profile.map_display_enabled);
  const [goals, setGoals] = useState<string[]>(profile.connection_goals ?? []);
  const [neurodivergence, setNeurodivergence] = useState<string[]>(profile.neurodivergence_tags ?? []);
  const [childAgeGroup, setChildAgeGroup] = useState<string[]>(profile.child_age_group ?? []);
  const [acceptsRequests, setAcceptsRequests] = useState(profile.accepts_friend_requests);
  const [acceptsMessage, setAcceptsMessage] = useState<"anyone" | "connection" | "nobody">(profile.accepts_first_message);

  function toggleArr(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  async function handleSave() {
    if (!displayName.trim()) { setMsg({ ok: false, text: "A megjelenített név kötelező." }); return; }
    setSaving(true);
    const result = await upsertCommunityProfile({
      display_name: displayName.trim(),
      role, intro_text: introText,
      county, city, district,
      map_display_enabled: mapEnabled,
      connection_goals: goals,
      neurodivergence_tags: neurodivergence,
      child_age_group: role === "szulo" ? childAgeGroup : [],
      accepts_friend_requests: acceptsRequests,
      accepts_first_message: acceptsMessage,
      profile_visibility: (profile.profile_visibility === "hidden" ? "hidden" : "active"),
    });
    setSaving(false);
    setMsg(result.ok ? { ok: true, text: "Profil mentve!" } : { ok: false, text: result.error ?? "Hiba" });
  }

  async function handleHide() {
    const newVis = profile.profile_visibility === "hidden" ? "active" : "hidden";
    await setCommunityProfileVisibility(newVis);
    router.refresh();
  }

  const isBudapest = city.toLowerCase().includes("budapest");

  return (
    <div className="space-y-6">
      <div>
        <label className="label-field">Megjelenített név *</label>
        <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
      </div>

      <div>
        <label className="label-field">Szerepkör</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.entries(ROLE_LABELS) as [CommunityRole, string][]).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setRole(val)}
              className={`rounded-xl border px-4 py-2.5 text-sm text-left transition ${role === val ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium" : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label-field">Bemutatkozás</label>
        <textarea className="input-field resize-y min-h-[80px]" value={introText} onChange={(e) => setIntroText(e.target.value)} maxLength={400} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label-field">Vármegye</label>
          <input className="input-field" value={county} onChange={(e) => setCounty(e.target.value)} />
        </div>
        <div>
          <label className="label-field">Település</label>
          <input className="input-field" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        {isBudapest && (
          <div>
            <label className="label-field">Kerület</label>
            <input className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="pl. VII." />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={mapEnabled} onChange={(e) => setMapEnabled(e.target.checked)} className="h-4 w-4 accent-sni-brand-teal" />
        Megjelenhetek a közösségi térképen
      </label>

      <div>
        <label className="label-field">Kapcsolódási célok</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CONNECTION_GOAL_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => toggleArr(goals, setGoals, opt.value)}
              className={`rounded-xl border px-3 py-2 text-sm text-left transition ${goals.includes(opt.value) ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium" : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label-field">Érintettség (opcionális)</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {NEURODIVERGENCE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => toggleArr(neurodivergence, setNeurodivergence, opt.value)}
              className={`rounded-xl border px-3 py-2 text-sm text-left transition ${neurodivergence.includes(opt.value) ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium" : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {role === "szulo" && (
        <div>
          <label className="label-field">Gyermek életkori sávja (opcionális)</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CHILD_AGE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => toggleArr(childAgeGroup, setChildAgeGroup, opt.value)}
                className={`rounded-xl border px-3 py-2 text-sm text-left transition ${childAgeGroup.includes(opt.value) ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-teal font-medium" : "border-gray-200 bg-white text-gray-700 hover:border-sni-brand-teal"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label-field">Ki írhat nekem üzenetet?</label>
        <div className="mt-2 space-y-2">
          {[
            { val: "anyone", label: "Bárki a közösségen belül" },
            { val: "connection", label: "Csak elfogadott kapcsolataim" },
            { val: "nobody", label: "Senki" },
          ].map((opt) => (
            <label key={opt.val} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700">
              <input type="radio" name="msg_privacy" value={opt.val} checked={acceptsMessage === opt.val} onChange={() => setAcceptsMessage(opt.val as typeof acceptsMessage)} className="accent-sni-brand-teal" />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {msg && (
        <p className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>
      )}

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Mentés..." : "Profil mentése"}
        </button>
        <button type="button" onClick={handleHide} className="btn-secondary">
          {profile.profile_visibility === "hidden" ? "Profil megjelenítése" : "Profil elrejtése"}
        </button>
      </div>
    </div>
  );
}
