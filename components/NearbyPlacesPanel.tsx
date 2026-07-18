"use client";

import { useState } from "react";
import { Navigation, X, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";
import { Place, Category } from "@/lib/types";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type PlaceWithDist = Place & { distKm: number };

export default function NearbyPlacesPanel({
  places,
  categories,
}: {
  places: Place[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceWithDist[]>([]);

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  function findNearby() {
    setError(null);
    setLoading(true);
    setResults([]);
    setOpen(true);

    if (!navigator.geolocation) {
      setError("A böngésző nem támogatja a helymeghatározást.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const nearby = places
          .filter((p) => p.latitude != null && p.longitude != null)
          .map((p) => ({
            ...p,
            distKm: haversineKm(latitude, longitude, p.latitude!, p.longitude!),
          }))
          .filter((p) => p.distKm <= 10)
          .sort((a, b) => a.distKm - b.distKm);
        setResults(nearby);
        setLoading(false);
      },
      (err) => {
        setError(
          err.code === 1
            ? "A helymeghatározás engedélyezése szükséges. Engedélyezd a böngészőben, majd próbáld újra."
            : "Nem sikerült lekérni a helyzetedet. Próbáld újra."
        );
        setLoading(false);
      },
      { timeout: 10000 }
    );
  }

  return (
    <>
      <button
        onClick={findNearby}
        className="btn-secondary inline-flex items-center gap-2"
        type="button"
      >
        <Navigation size={16} />
        Mi van a közelemben?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
            {/* Fejléc */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Navigation size={18} className="text-sni-brand-teal" />
                <h2 className="font-bold text-gray-900">10 km-en belül</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
                type="button"
                aria-label="Bezárás"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tartalom */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
                  <Loader2 size={32} className="animate-spin text-sni-brand-teal" />
                  <p className="text-sm">Helymeghatározás folyamatban...</p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {!loading && !error && results.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-4xl">📍</p>
                  <p className="mt-2 font-semibold text-gray-700">Nincs hely 10 km-en belül</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Az adatbázisban lévő helyek egyike sem található 10 km-es körzetedben.
                  </p>
                </div>
              )}

              {!loading && results.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-3">
                    <strong className="text-gray-800">{results.length} hely</strong> található 10 km-en belül
                  </p>
                  {results.map((p) => {
                    const cat = categoryBySlug.get(p.category);
                    const distLabel =
                      p.distKm < 1
                        ? `${Math.round(p.distKm * 1000)} m`
                        : `${p.distKm.toFixed(1)} km`;
                    return (
                      <Link
                        key={p.id}
                        href={`/helyek/${p.slug}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100"
                      >
                        <span className="text-2xl" aria-hidden>{cat?.icon ?? "📍"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-gray-900">{p.name}</p>
                          <p className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin size={11} />
                            {p.city}
                            {cat && (
                              <span className="ml-1 text-gray-400">· {cat.name}</span>
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-sni-brand-teal/10 px-2.5 py-1 text-xs font-bold text-sni-brand-teal">
                          {distLabel}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
