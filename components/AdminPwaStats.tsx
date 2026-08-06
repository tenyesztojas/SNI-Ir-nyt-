"use client";

import { useEffect, useState } from "react";
import { Smartphone, Loader2 } from "lucide-react";

type Period = "today" | "yesterday" | "7d" | "30d";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Ma" },
  { value: "yesterday", label: "Tegnap" },
  { value: "7d", label: "7 nap" },
  { value: "30d", label: "30 nap" },
];

interface Stats {
  totalInstalls: number;
  androidInstalls: number;
  iosInstalls: number;
  sessions: number;
}

export default function AdminPwaStats() {
  const [period, setPeriod] = useState<Period>("30d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/pwa-stats?period=${period}`)
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  return (
    <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Smartphone size={20} className="text-sni-brand-teal" />
          <h2 className="font-bold text-gray-800">PWA alkalmazás statisztika</h2>
        </div>
        {/* Időszak váltó */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                period === p.value
                  ? "bg-sni-brand-teal text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-sni-brand-teal">{stats.totalInstalls}</p>
            <p className="text-xs text-gray-500 mt-0.5">Összes telepítés</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-gray-700">{stats.androidInstalls}</p>
            <p className="text-xs text-gray-500 mt-0.5">Android telepítés</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-gray-700">{stats.iosInstalls}</p>
            <p className="text-xs text-gray-500 mt-0.5">iOS telepítés</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-sni-brand-blue">{stats.sessions}</p>
            <p className="text-xs text-gray-500 mt-0.5">PWA megnyitás</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">Nem sikerült betölteni.</p>
      )}
    </div>
  );
}
