"use client";

// "Pihenőpont hozzáadása" gomb + gyors űrlap — aktív útvonal közben.
// (Copy-frissítés, 2026-09-10: a korábbi "+ Pihenőpont" felirat helyett —
// KIZÁRÓLAG a user-facing szöveg változott, a komponens/props/logika nem.)
//
// SZABÁLYOK (Map/GPS/Rest Points sprint, L. pont):
//  - a mentés NEM tünteti el / állítja meg az aktív útvonalat (a szülő
//    komponens ezt a state-jét nem érinti, csak az onCreated callback-en
//    keresztül kap egy ÚJ pontot),
//  - NEM indul automatikus újratervezés,
//  - GPS esetén a koordináta automatikusan kitöltődik, de a felhasználó
//    kézzel is módosíthatja / GPS nélkül is menthet (ha van már ismert
//    pozíciója a szülőtől, vagy explicit engedélyezi itt).

import { useState } from "react";
import { useGeolocation } from "@/lib/hooks/useGeolocation";

export interface RestPointCreatedPayload {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export default function RestPointQuickAdd({ onCreated }: { onCreated?: (rp: RestPointCreatedPayload) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [toilet, setToilet] = useState(false);
  const [seating, setSeating] = useState(false);
  const [quietSpace, setQuietSpace] = useState(false);
  const [indoors, setIndoors] = useState(false);
  const [outdoors, setOutdoors] = useState(false);
  const [purchaseRequired, setPurchaseRequired] = useState(false);
  const [notes, setNotes] = useState("");

  const geo = useGeolocation();

  function handleOpen() {
    setOpen(true);
    setError(null);
  }

  function handleUseGps() {
    geo.requestOnce();
  }

  // Amikor a GPS pozíció megérkezik, kitöltjük vele a mezőket — de a
  // felhasználó felülírhatja.
  if (geo.status === "granted" && geo.latitude !== null && geo.longitude !== null && latitude === "" && longitude === "") {
    setLatitude(String(geo.latitude));
    setLongitude(String(geo.longitude));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!name.trim()) {
      setError("Adj rövid nevet a pihenőpontnak.");
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setError("Érvénytelen koordináta. Használd a GPS gombot, vagy add meg kézzel.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/rest-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          latitude: lat,
          longitude: lon,
          toilet,
          seating,
          quietSpace,
          indoors,
          outdoors,
          purchaseRequired,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "A mentés sikertelen.");
        return;
      }
      onCreated?.({ id: data.restPoint.id, name: data.restPoint.name, latitude: data.restPoint.latitude, longitude: data.restPoint.longitude });
      setOpen(false);
      setName("");
      setLatitude("");
      setLongitude("");
      setNotes("");
      setToilet(false);
      setSeating(false);
      setQuietSpace(false);
      setIndoors(false);
      setOutdoors(false);
      setPurchaseRequired(false);
    } catch {
      setError("Hálózati hiba történt a mentés közben.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={handleOpen} className="btn-secondary" aria-label="Pihenőpont hozzáadása">
        Pihenőpont hozzáadása
      </button>
    );
  }

  return (
    <div className="card border-2 border-sni-primary/40">
      <h3 className="text-sm font-semibold text-sni-text">Új pihenőpont</h3>
      <p className="mt-1 text-xs text-gray-500">
        Ez a pont csak neked lesz látható. Az aktív útvonalad nem törlődik, és nem indul újratervezés.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-700">Rövid név</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="pl. Pad a Duna-parton"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700">Szélesség (lat)</label>
            <input
              type="text"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700">Hosszúság (lon)</label>
            <input
              type="text"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button type="button" onClick={handleUseGps} className="btn-secondary whitespace-nowrap text-xs">
            {geo.status === "requesting" ? "Helymeghatározás…" : "GPS"}
          </button>
        </div>
        {geo.status === "denied" && <p className="text-xs text-amber-700">GPS engedély elutasítva — add meg a koordinátát kézzel.</p>}
        {(geo.status === "unavailable" || geo.status === "timeout") && (
          <p className="text-xs text-amber-700">A helymeghatározás most nem elérhető — add meg a koordinátát kézzel.</p>
        )}

        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={toilet} onChange={(e) => setToilet(e.target.checked)} /> WC</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={seating} onChange={(e) => setSeating(e.target.checked)} /> Ülőhely</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={quietSpace} onChange={(e) => setQuietSpace(e.target.checked)} /> Csendesebb rész</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={indoors} onChange={(e) => setIndoors(e.target.checked)} /> Beltéri</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={outdoors} onChange={(e) => setOutdoors(e.target.checked)} /> Kültéri</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={purchaseRequired} onChange={(e) => setPurchaseRequired(e.target.checked)} /> Vásárlás szükséges</label>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Megjegyzés (opcionális)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Mentés…" : "Mentés"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
            Mégse
          </button>
        </div>
      </form>
    </div>
  );
}
