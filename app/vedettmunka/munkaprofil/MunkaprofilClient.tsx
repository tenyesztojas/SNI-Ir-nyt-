"use client";

import { useState, useTransition } from "react";
import { saveWorkProfile } from "@/app/vedettmunka/actions";
import { ATTRIBUTE_LABELS, WIZARD_STEP_ATTRIBUTES } from "@/lib/vedettmunka/attributes";
import VmIcon from "@/components/vedettmunka/VmIcon";

const SECTIONS: { key: string; label: string }[] = [
  { key: "kiszamithatosag", label: "Kiszámíthatóság" },
  { key: "munkakornyzet",   label: "Munkakörnyezet" },
  { key: "betanitas",       label: "Betanítás és segítség" },
  { key: "munka_jellege",   label: "Munka jellege" },
  { key: "munkaidő",        label: "Munkaidő" },
  { key: "helyszin",        label: "Munkavégzés helye" },
  { key: "megkozelites",    label: "Megközelíthetőség" },
  { key: "szunet",          label: "Szünetek" },
];

export default function MunkaprofilClient({
  initialSlugs,
  initialNotes,
}: {
  initialSlugs: string[];
  initialNotes: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSlugs));
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(slug: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function handleSave() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const res = await saveWorkProfile([...selected], notes);
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Hiba történt mentés közben.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
        Jelöld meg, milyen munkakörnyezet illik hozzád. Ez segít megtalálni a számodra megfelelő állásokat.
        A profilod nem kerül megosztásra munkáltatókkal – csak az állások szűréséhez használjuk.
      </div>

      {SECTIONS.map(({ key, label }) => {
        const slugs = WIZARD_STEP_ATTRIBUTES[key] ?? [];
        if (!slugs.length) return null;
        return (
          <div key={key}>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{label}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {slugs.map((slug) => {
                const info = ATTRIBUTE_LABELS[slug];
                const active = selected.has(slug);
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => toggle(slug)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition
                      ${active
                        ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-navy shadow-sm"
                        : "border-gray-100 bg-gray-50 text-gray-600 hover:border-sni-brand-teal/40"
                      }`}
                  >
                    <div className={`shrink-0 ${active ? "text-sni-brand-teal" : "text-gray-400"}`}>
                      <VmIcon name={slug} size={88} />
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-snug">{info?.title ?? slug}</p>
                      {info?.desc && (
                        <p className="mt-0.5 text-xs leading-snug opacity-60">{info.desc}</p>
                      )}
                    </div>
                    {active && (
                      <span className="ml-auto shrink-0 h-4 w-4 rounded-full bg-sni-brand-teal flex items-center justify-center text-white text-[10px]">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-gray-700">Egyéb megjegyzés (opcionális)</label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
          rows={3}
          placeholder="pl. Sötétebb helyszínt preferálok. Nem bírom a nyílt irodát..."
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sni-brand-teal focus:ring-2 focus:ring-sni-brand-teal/20 resize-none"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      {saved && (
        <p className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700">
          ✓ Profil mentve! {selected.size} preferencia rögzítve.
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-sni-brand-navy px-6 py-3 text-sm font-bold text-white transition hover:bg-sni-brand-blue disabled:opacity-40"
        >
          {isPending ? "Mentés..." : "Profil mentése"}
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => { setSelected(new Set()); setSaved(false); }}
            className="rounded-full border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-500 transition hover:border-gray-400"
          >
            Összes törlése
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Kiválasztott preferenciák ({selected.size} db):</p>
          <div className="flex flex-wrap gap-1.5">
            {[...selected].map((slug) => (
              <span key={slug} className="inline-flex items-center gap-1.5 rounded-full bg-sni-brand-teal/10 px-2.5 py-1 text-xs font-semibold text-sni-brand-navy">
                <VmIcon name={slug} size={28} />
                {ATTRIBUTE_LABELS[slug]?.title ?? slug}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
