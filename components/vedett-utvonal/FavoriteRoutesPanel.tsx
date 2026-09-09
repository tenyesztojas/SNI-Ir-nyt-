"use client";

// Kedvenc útvonalak lista (VÉDETT ÚTVONAL — Kedvenc Útvonalak feladat,
// 2026-09-09) — a Védett Útvonal oldalon jelenik meg, a keresőform felett
// (lásd VedettUtvonalWorkspace.tsx). CSAK bejelentkezett felhasználónak
// (a /vedett-utvonal oldal SZERVER oldalon már kizárja a be nem
// jelentkezett felhasználót, lásd app/vedett-utvonal/page.tsx — ez a
// komponens tehát mindig bejelentkezett kontextusban renderelődik; az API
// oldali requireVedettRouteAccess() a MÁSODIK, független védelmi réteg).
//
// FONTOS: ez a komponens SOHA nem tárol/jelenít meg konkrét, kiszámolt
// journey-t — kizárólag a preset (honnan/hová/szenzoros prioritások)
// adatait listázza. A "Útvonal megtervezése" gomb az onSelect callback-en
// keresztül adja át a presetet a szülőnek (VedettUtvonalWorkspace), amely
// egy ÚJ VedettUtvonalSearchForm instance-t mountol ezzel a preset-tel —
// mindig FRISS keresést indít, sosem egy elavult journey-t tölt vissza.

import { useEffect, useState } from "react";
import type { FavoriteRoute } from "@/lib/vedett-route/favorites/types";

export type FavoriteRoutePreset = {
  originMode: FavoriteRoute["originMode"];
  originManual: FavoriteRoute["originManual"];
  destinationMode: FavoriteRoute["destinationMode"];
  destinationManual: FavoriteRoute["destinationManual"];
  destinationKnownPlace: FavoriteRoute["destinationKnownPlace"];
  weights: FavoriteRoute["weights"];
};

function toPreset(favorite: FavoriteRoute): FavoriteRoutePreset {
  return {
    originMode: favorite.originMode,
    originManual: favorite.originManual,
    destinationMode: favorite.destinationMode,
    destinationManual: favorite.destinationManual,
    destinationKnownPlace: favorite.destinationKnownPlace,
    weights: favorite.weights,
  };
}

function originSummary(favorite: FavoriteRoute): string {
  if (favorite.originMode === "CURRENT_LOCATION") return "Aktuális helyzetem";
  if (!favorite.originManual) return "Induló hely";
  return `${favorite.originManual.city}, ${favorite.originManual.districtOrPostalCode}`;
}

function destinationSummary(favorite: FavoriteRoute): string {
  if (favorite.destinationMode === "KNOWN_PLACE") return favorite.destinationKnownPlace?.name ?? "Cél";
  if (!favorite.destinationManual) return "Cél";
  return `${favorite.destinationManual.city}, ${favorite.destinationManual.districtOrPostalCode}`;
}

// Rövid szenzoros prioritás összefoglaló — csak azokat a szempontokat
// listázza, amik "Nagyon fontos"-ra vannak állítva (a leginformatívabb,
// legrövidebb összefoglaló egy kártyán) — a nyers 0/1/2 szám itt sem
// jelenik meg a felhasználónak.
const WEIGHT_SUMMARY_LABELS: Record<keyof FavoriteRoute["weights"], string> = {
  transfers: "átszállások",
  modeSwitches: "mód-váltások",
  underground: "földalatti szakasz",
  walking: "gyaloglás",
  duration: "utazási idő",
  waiting: "várakozás",
};

function veryImportantSummary(favorite: FavoriteRoute): string | null {
  const veryImportant = (Object.keys(WEIGHT_SUMMARY_LABELS) as (keyof FavoriteRoute["weights"])[]).filter(
    (key) => favorite.weights[key] === 2
  );
  if (veryImportant.length === 0) return null;
  return `⭐ Nagyon fontos: ${veryImportant.map((key) => WEIGHT_SUMMARY_LABELS[key]).join(", ")}`;
}

export default function FavoriteRoutesPanel({ onSelect }: { onSelect: (preset: FavoriteRoutePreset) => void }) {
  const [favorites, setFavorites] = useState<FavoriteRoute[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vedett-route/favorites");
        const data = (await res.json()) as { ok: boolean; favorites?: FavoriteRoute[]; message?: string };
        if (cancelled) return;
        if (data.ok && data.favorites) {
          setFavorites(data.favorites);
        } else {
          setLoadError(data.message ?? "Nem sikerült betölteni a kedvenc útvonalakat.");
        }
      } catch {
        if (!cancelled) setLoadError("Nem sikerült betölteni a kedvenc útvonalakat.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRenameSubmit(id: string) {
    setActionError(null);
    const name = renameValue.trim();
    if (!name) {
      setActionError("A kedvenc útvonal nevének megadása kötelező.");
      return;
    }
    try {
      const res = await fetch(`/api/vedett-route/favorites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { ok: boolean; favorite?: FavoriteRoute; message?: string };
      if (data.ok && data.favorite) {
        setFavorites((prev) => (prev ? prev.map((f) => (f.id === id ? data.favorite! : f)) : prev));
        setRenamingId(null);
      } else {
        setActionError(data.message ?? "Nem sikerült átnevezni a kedvenc útvonalat.");
      }
    } catch {
      setActionError("Nem sikerült átnevezni a kedvenc útvonalat.");
    }
  }

  async function handleDeleteConfirmed(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/vedett-route/favorites/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        setFavorites((prev) => (prev ? prev.filter((f) => f.id !== id) : prev));
      } else {
        setActionError(data.message ?? "Nem sikerült törölni a kedvenc útvonalat.");
      }
    } catch {
      setActionError("Nem sikerült törölni a kedvenc útvonalat.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-sni-text">Kedvenc útvonalaim</h2>

      {loadError && <p className="mt-2 text-sm text-amber-700">{loadError}</p>}
      {actionError && <p className="mt-2 text-sm text-amber-700">{actionError}</p>}

      {favorites === null && !loadError && <p className="mt-2 text-sm text-gray-500">Betöltés…</p>}

      {favorites !== null && favorites.length === 0 && (
        <div className="mt-2">
          <p className="text-sm text-gray-600">Kedvenc útvonalaid itt jelennek majd meg.</p>
          <p className="mt-1 text-xs text-gray-500">
            Mentsd el a gyakran használt útvonalaidat, így legközelebb nem kell újra megadnod az indulási és érkezési helyet.
          </p>
        </div>
      )}

      {favorites !== null && favorites.length > 0 && (
        <ul className="mt-3 space-y-2">
          {favorites.map((favorite) => (
            <li key={favorite.id} className="rounded border border-gray-200 p-3">
              {renamingId === favorite.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button type="button" onClick={() => handleRenameSubmit(favorite.id)} className="btn-secondary text-xs">
                    Mentés
                  </button>
                  <button type="button" onClick={() => setRenamingId(null)} className="text-xs text-gray-500 underline">
                    Mégse
                  </button>
                </div>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-medium text-sni-text">
                    <span aria-hidden="true">★</span>
                    {favorite.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {originSummary(favorite)} → {destinationSummary(favorite)}
                  </p>
                  {veryImportantSummary(favorite) && (
                    <p className="mt-0.5 text-xs text-gray-400">{veryImportantSummary(favorite)}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => onSelect(toPreset(favorite))} className="btn-primary text-xs">
                      Útvonal megtervezése
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(favorite.id);
                        setRenameValue(favorite.name);
                        setActionError(null);
                      }}
                      className="text-xs text-gray-500 underline"
                    >
                      Átnevezés
                    </button>
                    {pendingDeleteId === favorite.id ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">Biztosan törlöd ezt a kedvenc útvonalat?</span>
                        <button type="button" onClick={() => handleDeleteConfirmed(favorite.id)} className="font-semibold text-red-600 underline">
                          Törlés
                        </button>
                        <button type="button" onClick={() => setPendingDeleteId(null)} className="text-gray-500 underline">
                          Mégse
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setPendingDeleteId(favorite.id)} className="text-xs text-gray-500 underline">
                        Törlés
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
