"use client";

import { useState, useTransition } from "react";
import { upsertJobAlert } from "@/app/vedettmunka/actions";
import { SZELLEMI_KATEGORIAK, FIZIKAI_KATEGORIAK, HUNGARIAN_COUNTIES } from "@/lib/vedettmunka/categories";
import type { JobAlert } from "@/lib/vedettmunka/types";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-sni-brand-teal" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-5" : "left-0.5"}`} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

export default function ErtesitoClient({ initialAlert }: { initialAlert: JobAlert | null }) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(initialAlert?.enabled ?? true);
  const [workType, setWorkType] = useState(initialAlert?.work_type ?? "");
  const [city, setCity] = useState(initialAlert?.city ?? "");
  const [county, setCounty] = useState(initialAlert?.county ?? "");
  const [homeOffice, setHomeOffice] = useState(initialAlert?.home_office ?? false);
  const [hybrid, setHybrid] = useState(initialAlert?.hybrid ?? false);
  const [partTime, setPartTime] = useState(initialAlert?.part_time ?? false);
  const [flex, setFlex] = useState(initialAlert?.flexible_schedule ?? false);
  const [nd, setNd] = useState(initialAlert?.open_to_neurodivergent ?? false);
  const [disabled, setDisabled] = useState(initialAlert?.open_to_disabled ?? false);
  const [parents, setParents] = useState(initialAlert?.open_to_parents ?? false);
  const [freq, setFreq] = useState(initialAlert?.frequency ?? "heti");
  const [selCats, setSelCats] = useState<string[]>(initialAlert?.categories ?? []);

  function toggleCat(c: string) {
    setSelCats((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("enabled", String(enabled));
    fd.set("work_type", workType);
    fd.set("city", city);
    fd.set("county", county);
    fd.set("home_office", String(homeOffice));
    fd.set("hybrid", String(hybrid));
    fd.set("part_time", String(partTime));
    fd.set("flexible_schedule", String(flex));
    fd.set("open_to_neurodivergent", String(nd));
    fd.set("open_to_disabled", String(disabled));
    fd.set("open_to_parents", String(parents));
    fd.set("frequency", freq);
    selCats.forEach((c) => fd.append("categories", c));

    startTransition(async () => {
      try {
        await upsertJobAlert(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Toggle label="Értesítő bekapcsolva" checked={enabled} onChange={setEnabled} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-700">Munkatípus</span>
        <select value={workType} onChange={(e) => setWorkType(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal">
          <option value="">Mindegy</option>
          <option value="szellemi">Szellemi munka</option>
          <option value="fizikai">Fizikai munka</option>
          <option value="mindketto">Mindkettő</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-700">Város</span>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="pl. Budapest"
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-700">Vármegye</span>
        <select value={county} onChange={(e) => setCounty(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-sni-brand-teal">
          <option value="">Mindegy</option>
          {HUNGARIAN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-gray-700">Feltételek</span>
        <Toggle label="Otthoni munkavégzés (home office)" checked={homeOffice} onChange={setHomeOffice} />
        <Toggle label="Hibrid" checked={hybrid} onChange={setHybrid} />
        <Toggle label="Részmunkaidő" checked={partTime} onChange={setPartTime} />
        <Toggle label="Rugalmas munkaidő" checked={flex} onChange={setFlex} />
        <Toggle label="Neurodivergens személyeknek nyitott" checked={nd} onChange={setNd} />
        <Toggle label="Megváltozott munkaképességűeknek nyitott" checked={disabled} onChange={setDisabled} />
        <Toggle label="Szülőknek is alkalmas" checked={parents} onChange={setParents} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-gray-700">Értesítés gyakorisága</span>
        <div className="flex gap-4">
          {[{ value: "heti", label: "Heti összesítő" }, { value: "azonnali", label: "Azonnal (új álláskor)" }].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="freq" value={value} checked={freq === value} onChange={() => setFreq(value as "heti" | "azonnali")} className="accent-sni-brand-teal" />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-gray-700">Kategóriák (opcionális)</span>
        <div className="flex flex-wrap gap-2">
          {[...SZELLEMI_KATEGORIAK, ...FIZIKAI_KATEGORIAK].map((c) => (
            <button key={c} type="button" onClick={() => toggleCat(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${selCats.includes(c) ? "bg-sni-brand-teal text-sni-brand-navy" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">✓ Mentve!</p>}

      <button type="submit" disabled={isPending}
        className="self-start rounded-full bg-sni-brand-teal px-6 py-2.5 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white disabled:opacity-60">
        {isPending ? "Mentés..." : "Értesítő mentése"}
      </button>
    </form>
  );
}
