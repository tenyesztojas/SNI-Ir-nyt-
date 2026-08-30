"use client";

import { useState } from "react";
import { SZELLEMI_KATEGORIAK, FIZIKAI_KATEGORIAK, HUNGARIAN_COUNTIES } from "@/lib/vedettmunka/categories";

interface Props {
  defaults: Record<string, string | undefined>;
}

const CHECKBOXES = [
  { name: "part_time",  label: "Részmunkaidő" },
  { name: "nd",         label: "Neurodivergens jelölteknek" },
  { name: "disabled",   label: "Megváltozott munkaképességű személyeknek" },
  { name: "parents",    label: "Szülőknek is alkalmas" },
  { name: "mentor",     label: "Támogató személy van" },
  { name: "written",    label: "Írásos feladatok elérhetők" },
  { name: "quiet",      label: "Csendesebb munkakörnyezet" },
  { name: "low_verbal", label: "Kevés beszélgetés emberekkel" },
];

export default function AllasokFilterClient({ defaults }: Props) {
  const [workType, setWorkType] = useState(defaults.work_type ?? "");

  const kategoriak =
    workType === "szellemi"
      ? SZELLEMI_KATEGORIAK
      : workType === "fizikai"
      ? FIZIKAI_KATEGORIAK
      : [];

  return (
    <form method="GET" className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5">
      <h2 className="font-bold text-sni-brand-navy">Szűrők</h2>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Keresés</span>
        <input
          name="q"
          defaultValue={defaults.q}
          placeholder="pl. raktáros, admin..."
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </label>

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
              <option key={k.value} value={k.value}>
                {k.description ? `${k.label} – ${k.description}` : k.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Város</span>
        <input
          name="city"
          defaultValue={defaults.city}
          placeholder="pl. Budapest"
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Vármegye</span>
        <select
          name="county"
          defaultValue={defaults.county ?? ""}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          {HUNGARIAN_COUNTIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-gray-500">Munkavégzés helye</span>
        <select
          name="location"
          defaultValue={defaults.location ?? ""}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal"
        >
          <option value="">Mindegy</option>
          <option value="munkahelyen">Munkahelyen</option>
          <option value="otthonrol">Otthonról</option>
          <option value="hibrid">Otthon és munkahelyen is</option>
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-500">Feltételek</span>
        {CHECKBOXES.map(({ name, label }) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value="1"
              defaultChecked={defaults[name] === "1"}
              className="rounded"
            />
            {label}
          </label>
        ))}
      </div>

      <button
        type="submit"
        className="rounded-full bg-sni-brand-teal py-2 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
      >
        Keresés
      </button>
      <a href="/vedettmunka/allasok" className="text-center text-xs text-gray-400 hover:underline">
        Szűrők törlése
      </a>
    </form>
  );
}
