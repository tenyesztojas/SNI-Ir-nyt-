"use client";

import { useState, useRef } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Category } from "@/lib/types";

function CityAutocomplete({
  cities,
  defaultValue,
}: {
  cities: string[];
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const skipBlur = useRef(false);

  const matches = value.trim()
    ? cities
        .filter((c) => c.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 10)
    : [];

  return (
    <div className="relative sm:w-44">
      <input
        type="text"
        name="telepules"
        value={value}
        placeholder="Összes település"
        className="input-field w-full"
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          if (!skipBlur.current) setOpen(false);
          skipBlur.current = false;
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 top-full z-[200] mt-1 w-48 max-h-60 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
          {matches.map((c) => (
            <li
              key={c}
              onMouseDown={() => { skipBlur.current = true; }}
              onClick={() => { setValue(c); setOpen(false); }}
              className="cursor-pointer px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
      {/* Szöveges kereső */}
      <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow focus-within:border-sni-brand-teal focus-within:ring-2 focus-within:ring-sni-brand-teal/30">
        {!q && <Search className="ml-3.5 shrink-0 text-gray-400" size={18} />}
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

      {/* Kategória */}
      <select name="kategoria" defaultValue={defaultKategoria} className="input-field sm:w-52">
        <option value="">Összes kategória</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      {/* Város autocomplete */}
      <CityAutocomplete cities={cities} defaultValue={defaultTelepules} />

      <button type="submit" className="btn-primary sm:px-6">
        <SlidersHorizontal size={16} /> Szűrés
      </button>
    </form>
  );
}
