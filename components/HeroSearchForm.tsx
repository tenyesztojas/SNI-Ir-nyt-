"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { Category } from "@/lib/types";

function QInput({ cities }: { cities: string[] }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 200 });
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const suggestions =
    value.trim().length >= 2
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
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          size={20}
        />
        <input
          ref={inputRef}
          type="text"
          name="q"
          value={value}
          placeholder="Hely neve vagy város..."
          autoComplete="off"
          className="w-full rounded-xl border-0 py-3.5 pl-12 pr-4 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sni-brand-teal/50"
          onChange={(e) => { setValue(e.target.value); updatePos(); setOpen(true); }}
          onFocus={() => { updatePos(); setOpen(true); }}
          onBlur={hide}
        />
      </div>
      {mounted && open && suggestions.length > 0 &&
        createPortal(
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

export default function HeroSearchForm({
  categories,
  cities,
}: {
  categories: Category[];
  cities: string[];
}) {
  return (
    <form
      action="/helyek"
      method="get"
      className="mt-8 overflow-hidden rounded-2xl bg-white p-2 shadow-2xl sm:flex sm:gap-2"
    >
      <QInput cities={cities} />
      <select
        name="kategoria"
        defaultValue=""
        className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-3.5 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sni-brand-teal/50 sm:mt-0 sm:w-48"
      >
        <option value="">Minden kategória</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="telepules"
        list="hero-cities"
        placeholder="Város..."
        className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-3.5 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sni-brand-teal/50 sm:mt-0 sm:w-40"
      />
      <datalist id="hero-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <button
        type="submit"
        className="mt-2 w-full rounded-xl bg-sni-brand-teal px-8 py-3.5 font-bold text-white transition-colors hover:bg-sni-brand-blue sm:mt-0 sm:w-auto"
      >
        Keresés
      </button>
    </form>
  );
}
