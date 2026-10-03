"use client";

// Mentett helyek — kompakt panel a keresőformban. Szerver oldali, fiókhoz
// kötött adat (NEM localStorage, NEM eszközfüggő). Címet/koordinátát nem
// logolunk. A kiválasztott hely a MEGLÉVŐ útvonaltervező állapotába kerül
// (MAP_PICKED, koordinátákkal) — nincs újra-geokódolás.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SavedPlace } from "@/lib/vedett-route/savedPlaces/types";
import { routeLocationToSavable } from "@/lib/vedett-route/savedPlaces/adapt";
import { SAVED_PLACES_LIMIT, SAVED_PLACE_NAME_MAX } from "@/lib/vedett-route/savedPlaces/schemas";

const SMALL = "min-h-[36px] rounded-md border border-gray-300 px-2 text-xs font-semibold text-sni-text hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal";
const NAME_SUGGESTIONS = ["Otthon", "Munkahely", "Iskola"];
const BTN = "min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-sni-text hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal";

type Loc = { type: string; name?: string; latitude?: number; longitude?: number } | null | undefined;

export default function SavedPlacesPanel({
  isAuthenticated,
  currentOrigin,
  currentDestination,
  onUseAsOrigin,
  onUseAsDestination,
}: {
  isAuthenticated: boolean;
  currentOrigin: Loc;
  currentDestination: Loc;
  onUseAsOrigin: (place: SavedPlace) => void;
  onUseAsDestination: (place: SavedPlace) => void;
}) {
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveSource, setSaveSource] = useState<"origin" | "destination">("destination");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/vedett-route/saved-places", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error();
      setPlaces(json.places as SavedPlace[]);
    } catch {
      setLoadError("A mentett helyek betöltése sikertelen.");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && open && places === null) void load();
  }, [isAuthenticated, open, places, load]);

  if (!isAuthenticated) {
    return (
      <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
        Bejelentkezéssel mentett helyeket (pl. Otthon, Munkahely) is használhatsz.{" "}
        <Link href="/belepes?next=%2Fvedett-utvonal" className="font-semibold text-sni-brand-blue hover:underline">
          Belépés
        </Link>
      </p>
    );
  }

  const savable = routeLocationToSavable(saveSource === "origin" ? currentOrigin : currentDestination);
  const atLimit = (places?.length ?? 0) >= SAVED_PLACES_LIMIT;

  async function handleCreate() {
    if (!savable || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/vedett-route/saved-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newName, ...savable }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.message ?? "A mentés sikertelen.");
      setPlaces((prev) => [...(prev ?? []), json.place as SavedPlace]);
      setNewName("");
      setShowForm(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "A mentés sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/vedett-route/saved-places/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: renameValue }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.message ?? "Az átnevezés sikertelen.");
      setPlaces((prev) => (prev ?? []).map((p) => (p.id === id ? (json.place as SavedPlace) : p)));
      setRenamingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Az átnevezés sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/vedett-route/saved-places/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.message ?? "A törlés sikertelen.");
      setPlaces((prev) => (prev ?? []).filter((p) => p.id !== id));
      setDeletingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "A törlés sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2 rounded-lg border border-gray-200 px-3 py-2" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-sni-text">Mentett helyek</summary>

      {loadError && (
        <p role="alert" className="text-sm text-red-700">
          {loadError}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void load()}>
            Újra
          </button>
        </p>
      )}
      {places === null && !loadError && <p className="text-sm text-gray-600">Betöltés…</p>}
      {places !== null && places.length === 0 && <p className="text-sm text-gray-600">Még nincs mentett helyed.</p>}

      {places && places.length > 0 && (
        <ul className="space-y-1.5">
          {places.map((p) => (
            <li key={p.id} className="rounded-lg bg-gray-50 px-2 py-1.5">
              {renamingId === p.id ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={SAVED_PLACE_NAME_MAX}
                    aria-label="Új név"
                    className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
                  />
                  <button type="button" className={BTN} disabled={busy || !renameValue.trim()} onClick={() => void handleRename(p.id)}>
                    Mentés
                  </button>
                  <button type="button" className={BTN} onClick={() => setRenamingId(null)}>
                    Mégse
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-sni-text">{p.displayName}</p>
                      <p className="truncate text-xs text-gray-600">{p.address}</p>
                    </div>
                    <button type="button" className={BTN} onClick={() => onUseAsOrigin(p)}>
                      Indulás
                    </button>
                    <button type="button" className={BTN} onClick={() => onUseAsDestination(p)}>
                      Úti cél
                    </button>
                    <button
                      type="button"
                      className={`${BTN} px-2`}
                      aria-label="További műveletek"
                      aria-expanded={menuId === p.id}
                      onClick={() => {
                        setMenuId(menuId === p.id ? null : p.id);
                        setDeletingId(null);
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                  {menuId === p.id && deletingId !== p.id && (
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        className={SMALL}
                        onClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.displayName);
                          setMenuId(null);
                        }}
                      >
                        Átnevezés
                      </button>
                      <button type="button" className={SMALL} onClick={() => setDeletingId(p.id)}>
                        Törlés
                      </button>
                    </div>
                  )}
                  {deletingId === p.id && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm">Biztosan törlöd?</span>
                      <button type="button" className={SMALL} disabled={busy} onClick={() => void handleDelete(p.id)}>
                        Igen, törlés
                      </button>
                      <button type="button" className={SMALL} onClick={() => { setDeletingId(null); setMenuId(null); }}>
                        Mégse
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 border-t border-gray-200 pt-2">
        {!showForm ? (
          <button type="button" className={BTN} onClick={() => setShowForm(true)}>
            + Új hely mentése
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-sni-text">Hely mentése</p>
            <div className="flex gap-2" role="group" aria-label="Melyik helyet mented?">
              <button type="button" aria-pressed={saveSource === "origin"} className={BTN} onClick={() => setSaveSource("origin")}>
                Indulási hely
              </button>
              <button type="button" aria-pressed={saveSource === "destination"} className={BTN} onClick={() => setSaveSource("destination")}>
                Úti cél
              </button>
            </div>
            {savable ? (
              <p className="text-xs text-gray-600">{savable.address}</p>
            ) : (
              <p className="text-xs text-gray-600">Előbb válassz ki egy címet a javaslatok közül (vagy a térképen), hogy menthesd.</p>
            )}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={SAVED_PLACE_NAME_MAX}
              placeholder="Név (pl. Nagyi, Edzés)"
              aria-label="A mentett hely neve"
              className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {NAME_SUGGESTIONS.map((s) => (
                <button key={s} type="button" className={SMALL} onClick={() => setNewName(s)}>
                  {s}
                </button>
              ))}
            </div>
            {atLimit && <p className="text-xs text-amber-800">Elérted a {SAVED_PLACES_LIMIT} mentett helyes korlátot. Törölj egyet az újhoz.</p>}
            <div className="flex gap-2">
              <button type="button" className={BTN} disabled={!savable || !newName.trim() || busy || atLimit} onClick={() => void handleCreate()}>
                Mentés
              </button>
              <button type="button" className={BTN} onClick={() => setShowForm(false)}>
                Mégse
              </button>
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {actionError}
        </p>
      )}
    </details>
  );
}
