"use client";

// Kedvenc útvonalak — "1 kattintásos újratervezés" (VÉDETT ÚTVONAL —
// Kedvenc Útvonalak feladat, 2026-09-09, spec 23. pont).
//
// Ez a client wrapper köti össze a FavoriteRoutesPanel listát a
// VedettUtvonalSearchForm kereső formmal. Amikor a felhasználó egy
// kedvencen az "Útvonal megtervezése" gombra kattint, ez EGY ÚJ
// VedettUtvonalSearchForm instance-t mountol (a `key` prop megváltoztatásán
// keresztül) a kedvenc preset-jével — ez garantálja, hogy:
//   - a form állapota (origin/destination/weights) a preset szerint indul,
//   - SOHA nem marad benne egy előző keresés elavult journey-eredménye
//     (a `result` state a formon belül mindig üresen indul egy friss
//     mountnál),
//   - CURRENT_LOCATION induló mód esetén NEM indul automatikus GPS-kérés
//     (a form maga sosem kér GPS-t mount-time useEffect-ből, lásd
//     VedettUtvonalSearchForm.tsx fejléce — ez a szabály itt is
//     változatlan, hiszen a form kódja nem módosul ebben a tekintetben).
//
// A deep-linkből érkező initialDestination (Védett Hely "Navigálj oda"
// integráció) és a kedvenc preset EGYSZERRE nem releváns (a deep link csak
// az oldal ELSŐ betöltésekor aktív) — ha mindkettő adott, az
// initialDestination nyer az induló mounton (lásd
// VedettUtvonalSearchForm.tsx initialDestination ág elsőbbsége), a
// felhasználó ezután bármikor választhat egy kedvencet is.

import { useState } from "react";
import FavoriteRoutesPanel, { type FavoriteRoutePreset } from "./FavoriteRoutesPanel";
import VedettUtvonalSearchForm from "./VedettUtvonalSearchForm";

export default function VedettUtvonalWorkspace({
  disabled,
  initialDestination,
}: {
  disabled: boolean;
  initialDestination: { name: string; latitude: number; longitude: number } | null;
}) {
  const [selectedPreset, setSelectedPreset] = useState<{ key: number; preset: FavoriteRoutePreset } | null>(null);

  function handleSelectFavorite(preset: FavoriteRoutePreset) {
    setSelectedPreset((prev) => ({ key: (prev?.key ?? 0) + 1, preset }));
  }

  return (
    <div className="space-y-4">
      <FavoriteRoutesPanel onSelect={handleSelectFavorite} />

      <VedettUtvonalSearchForm
        key={selectedPreset?.key ?? "initial"}
        disabled={disabled}
        initialDestination={selectedPreset ? null : initialDestination}
        initialFavoritePreset={selectedPreset?.preset ?? null}
      />
    </div>
  );
}
