"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { Category } from "@/lib/types";

function QInput({ cities, defaultValue }: { cities: string[]; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 200 });
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const suggestions = value.trim().length >= 2
    ? cities.filter((c) => c.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : [];

  function updatePos() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }

  function hide() {
    timer.current = window.setTimeout(() => setOpen(false), 150);
  }

  function pick(city: string) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setValue(city);
    setOpen(false);
  }

  return (
    <>
      <div className="flex flex-1 items-center rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow focus-within:border-sni-brand-teal focus-within:ring-2 focus-within:ring-sni-brand-teal/30">
        {!value && <Search className="ml-3.5 shrink-0 text-gray-400" size={18} />}
        <input
          ref={inputRef}
          type="text"
          name="q"
          value={value}
          placeholder="Hely neve vagy város..."
          className="w-full bg-transparent py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
          style={{ paddingLeft: value ? "1rem" : "0.5rem", paddingRight: "1rem" }}
          autoComplete="off"
          onChange={(e) => { setValue(e.target.value); updatePos(); setOpen(true); }}
          onFocus={() => { updatePos(); setOpen(true); }}
          onBlur={hide}
        />
      </div>
      {mounted && open && suggestions.length > 0 && createPortal(
        <ul
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
            listStyle: "none",
            margin: 0,
            padding: "4px 0",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            maxHeight: "224px",
            overflowY: "auto",
          }}
        >
          {suggestions.map((c) => (
            <li
              key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              style={{ padding: "10px 16px", cursor: "pointer", fontSize: "14px", color: "#374151" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              {c}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
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
  return (
    <form action="/helyek" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
      <QInput cities={cities} defaultValue={defaultQ} />

      <select name="kategoria" defaultValue={defaultKategoria} className="input-field sm:w-52">
        <option value="">Összes kategória</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      <select name="telepules" defaultValue={defaultTelepules} className="input-field sm:w-44">
        <option value="">Összes település</option>
        {cities.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <button type="submit" className="btn-primary sm:px-6">
        <SlidersHorizontal size={16} /> Szűrés
      </button>
    </form>
  );
}
