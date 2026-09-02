"use client";

import { useState } from "react";
import { SZELLEMI_KATEGORIAK, FIZIKAI_KATEGORIAK } from "@/lib/vedettmunka/categories";
import VmIcon from "@/components/vedettmunka/VmIcon";

interface Props {
  defaults: Record<string, string | undefined>;
  locations: { county: string; city: string }[];
}

// Vizuális toggle szűrők piktogrammal
const VM_FILTERS: { slug: string; label: string; param: string }[] = [
  { slug: "gradual_training",    label: "Fokozatos betanítás",           param: "betanitas"  },
  { slug: "assigned_mentor",     label: "Kijelölt segítő",               param: "mentor"     },
  { slug: "quieter_env",         label: "Csendes környezet",             param: "quiet"      },
  { slug: "small_team",          label: "Kis csapat",                    param: "kis_csapat" },
  { slug: "low_verbal",          label: "Kevés beszélgetés",             param: "low_verbal" },
  { slug: "written_tasks",       label: "Írásban is megkapod a feladatot", param: "written"  },
  { slug: "part_time",           label: "Részmunkaidő",                  param: "part_time"  },
  { slug: "flexible_hours",      label: "Rugalmas munkaidő",             param: "flex"       },
  { slug: "home_office",         label: "Otthoni munkavégzés",           param: "home_office"},
  { slug: "predictable_schedule",label: "Kiszámítható munkarend",        param: "pred_sched" },
];

export default function AllasokFilterClient({ defaults, locations }: Props) {
  const [workType, setWorkType] = useState(defaults.work_type ?? "");
  const [selectedCounty, setSelectedCounty] = useState(defaults.county ?? "");

  const kategoriak =
    workType === "szellemi" ? SZELLEMI_KATEGORIAK
    : workType === "fizikai" ? FIZIKAI_KATEGORIAK
    : [];

  // Csak azok a megyék, ahol van állás (rendezve)
  const availableCounties = [...new Set(locations.map((l) => l.county))].sort((a, b) =>
    a.localeCompare(b, "hu")
  );

  // Az adott megyéhez tartozó városok (ahol van állás)
  const citiesForCounty = selectedCounty
    ? [...new Set(
        locations
          .filter((l) => l.county === selectedCounty)
          .map((l) => l.city)
      )].sort((a, b) => a.localeCompare(b, "hu"))
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

      {/* Megye – csak ahol van állás */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Megye</span>
        <select
          name="county"
          value={selectedCounty}
          onChange={(e) => { setSelectedCounty(e.target.value); }}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          {availableCounties.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      {/* Település – csak ahol van állás az adott megyében */}
      {selectedCounty && citiesForCounty.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Település</span>
          <select
            name="city"
            defaultValue={defaults.city ?? ""}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
          >
            <option value="">Mindegy</option>
            {citiesForCounty.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      )}

      {/* Munkavégzés helye */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Munkavégzés helye</span>
        <select
          name="location"
          defaultValue={defaults.location ?? ""}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          <option value="munkahelyen">Munkahelyen</option>
          <option value="otthonrol">Otthon</option>
          <option value="hibrid">Munkahelyen és otthon</option>
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
                <VmIcon name={slug} size={20} className={active ? "text-sni-brand-teal" : "text-gray-400"} />
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
