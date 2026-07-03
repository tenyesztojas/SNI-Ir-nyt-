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
      <div className="relative flex-1">
        {!q && (
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
        )}
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Település vagy hely neve..."
          className={`input-field transition-all ${!q ? "pl-10" : "pl-4"}`}
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

      <div className="relative sm:w-44">
        <input
          list="cities-list"
          name="telepules"
          defaultValue={defaultTelepules}
          placeholder="Összes település"
          className="input-field w-full"
          autoComplete="off"
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
