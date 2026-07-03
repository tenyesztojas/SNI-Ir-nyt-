"use client";

import { useState, useRef } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Category } from "@/lib/types";

function CityCombobox({
  cities,
  defaultValue,
}: {
  cities: string[];
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = value.trim()
    ? cities.filter((c) => c.toLowerCase().includes(value.toLowerCase())).slice(0, 10)
    : cities.slice(0, 10);

  function openDrop() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 192) });
    }
    setOpen(true);
  }

  function closeDrop() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  function pick(city: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setValue(city);
    setOpen(false);
  }

  return (
    <div className="sm:w-44">
      <input
        ref={inputRef}
        type="text"
        name="telepules"
        value={value}
        placeholder="Összes település"
        className="input-field w-full"
        autoComplete="off"
        onChange={(e) => { setValue(e.target.value); openDrop(); }}
        onFocus={openDrop}
        onBlur={closeDrop}
      />
      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
          }}
          className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
        >
          {suggestions.map((c) => (
            <li
              key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
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
          placeholder="Hely neve..."
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
      <CityCombobox cities={cities} defaultValue={defaultTelepules} />

      <button type="submit" className="btn-primary sm:px-6">
        <SlidersHorizontal size={16} /> Szűrés
      </button>
    </form>
  );
}
