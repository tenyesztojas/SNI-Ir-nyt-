"use client";

import { useState } from "react";
import { SZELLEMI_KATEGORIAK, FIZIKAI_KATEGORIAK } from "@/lib/vedettmunka/categories";
import VmIcon from "@/components/vedettmunka/VmIcon";

interface Props {
  defaults: Record<string, string | undefined>;
  counties: string[];
}

// Vizuális toggle szűrők piktogrammal
const VM_FILTERS: { name: string; slug: string; label: string; param: string }[] = [
  { name: "Fokozatos betanítás",    slug: "gradual_training",    label: "Fokozatos betanítás",    param: "betanitas"  },
  { name: "Kijelölt segítő",        slug: "assigned_mentor",     label: "Kijelölt segítő",        param: "mentor"     },
  { name: "Csendesebb környezet",   slug: "quieter_env",         label: "Csendesebb környezet",   param: "quiet"      },
  { name: "Kis csapat",             slug: "small_team",          label: "Kis csapat",             param: "kis_csapat" },
  { name: "Kevés beszélgetés",      slug: "low_verbal",          label: "Kevés beszélgetés",      param: "low_verbal" },
  { name: "Írásban is kapod",       slug: "written_tasks",       label: "Írásban is megkapod",    param: "written"    },
  { name: "Részmunkaidő",           slug: "part_time",           label: "Részmunkaidő",           param: "part_time"  },
  { name: "Rugalmas munkaidő",      slug: "flexible_hours",      label: "Rugalmas munkaidő",      param: "flex"       },
  { name: "Home office",            slug: "home_office",         label: "Home office",            param: "home_office"},
  { name: "Kiszámítható munkarend", slug: "predictable_schedule",label: "Kiszám. munkarend",      param: "pred_sched" },
];

export default function AllasokFilterClient({ defaults, counties }: Props) {
  const [workType, setWorkType] = useState(defaults.work_type ?? "");

  const kategoriak =
    workType === "szellemi" ? SZELLEMI_KATEGORIAK
    : workType === "fizikai" ? FIZIKAI_KATEGORIAK
    : [];

  const activeParams = new Set(
    Object.entries(defaults)
      .filter(([, v]) => v === "1")
      .map(([k]) => k)
  );

  return (
    <form method="GET" className="flex flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <h2 className="font-bold text-sni-brand-navy">Szűrők</h2>

      {/* Keresés */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Keresés</span>
        <input
          name="q"
          defaultValue={defaults.q}
          placeholder="pl. raktáros, admin..."
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </label>

      {/* Munkatípus */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Munkatípus</span>
        <select
          name="work_type"
          value={workType}
          onChange={(e) => setWorkType(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          <option value="szellemi">Szellemi munka</option>
          <option value="fizikai">Fizikai munka</option>
        </select>
      </label>

      {/* Kategória */}
      {kategoriak.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Kategória</span>
          <select
            name="category"
            defaultValue={defaults.category ?? ""}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
          >
            <option value="">Mindegy</option>
            {kategoriak.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
      )}

      {/* Megye */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Megye</span>
        <select
          name="county"
          defaultValue={defaults.county ?? ""}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          {counties.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      {/* Munkavégzés helye */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Munkavégzés helye</span>
        <select
          name="location"
          defaultValue={defaults.location ?? ""}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          <option value="munkahelyen">Helyszíni</option>
          <option value="otthonrol">Home office</option>
          <option value="hibrid">Hibrid</option>
        </select>
      </label>

      {/* VédettMunka vizuális szűrők */}
      <div>
        <span className="text-xs font-semibold text-gray-500 block mb-2">
          Milyen munkahelyet keresel?
        </span>
        <div className="flex flex-col gap-1.5">
          {VM_FILTERS.map(({ slug, label, param }) => {
            const active = activeParams.has(param);
            return (
              <label
                key={param}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition
                  ${active
                    ? "border-sni-brand-teal bg-sni-brand-teal/10 text-sni-brand-navy"
                    : "border-gray-100 bg-gray-50 text-gray-600 hover:border-sni-brand-teal/40 hover:bg-sni-brand-teal/5"
                  }`}
              >
                <input
                  type="checkbox"
                  name={param}
                  value="1"
                  defaultChecked={active}
                  className="sr-only"
                />
                <VmIcon name={slug} size={14} className={active ? "text-sni-brand-teal" : "text-gray-400"} />
                {label}
                {active && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-sni-brand-teal" />
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Gombok */}
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-full bg-sni-brand-navy py-2 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
        >
          Szűrés
        </button>
        <a
          href="/vedettmunka/allasok"
          className="flex-1 rounded-full border border-gray-200 py-2 text-center text-sm font-semibold text-gray-500 transition hover:border-gray-400"
        >
          Törlés
        </a>
      </div>
    </form>
  );
}
