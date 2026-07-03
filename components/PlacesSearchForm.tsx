"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Category } from "@/lib/types";

export default function PlacesSearchForm({
  categories,
  cities,
  defaultQ,
  defaultKategoria,
  defaultTelepules,
}: {
  categories: Category[];
  cities: string[];
  defaultQ: string;
  defaultKategoria: string;
  defaultTelepules: string;
}) {
  const [q, setQ] = useState(defaultQ);

  return (
    <form action="/helyek" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
      {/* Szöveges kereső – nagyító eltűnik gépeléskor */}
      <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-white shadow-sm focus-within:border-sni-brand-teal focus-within:ring-2 focus-within:ring-sni-brand-teal/30 transition-shadow">
        {!q && (
          <Search className="ml-3.5 shrink-0 text-gray-400" size={18} />
        )}
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Település vagy hely neve..."
          className="w-full bg-transparent py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
          style={{ paddingLeft: q ? "1rem" : "0.5rem", paddingRight: "1rem" }}
        />
      </div>

      <select name="kategoria" defaultValue={defaultKategoria} className="input-field sm:w-52">
        <option value="">Összes kategória</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      {/* Városmező datalist autocomplete-tel */}
      <div className="sm:w-44">
        <input
          list="cities-list"
          name="telepules"
          defaultValue={defaultTelepules}
          placeholder="Összes település"
          className="input-field w-full"
        />
        <datalist id="cities-list">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <button type="submit" className="btn-primary sm:px-6">
        <SlidersHorizontal size={16} /> Szűrés
      </button>
    </form>
  );
}
