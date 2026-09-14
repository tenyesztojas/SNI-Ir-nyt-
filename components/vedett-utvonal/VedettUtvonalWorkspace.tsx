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
import VedettUtvonalMap from "./VedettUtvonalMap";
import { useAddressAutocomplete } from "@/lib/vedett-route/useAddressAutocomplete";

// KÖZLEKEDÉSI MÓD VÁLASZTÓ (2026-09-14) — a Védett Útvonal ebben a
// sprintben KÉT módot különböztet meg: "transit" (a meglévő, teljes
// tömegközlekedési kereső/rangsoroló rendszer, VÁLTOZATLANUL) és "car"
// (egyelőre csak egy placeholder — az autós routing NEM része ennek a
// sprintnek). Alapérték: "transit". A választó KIZÁRÓLAG ezt a wrapper
// komponenst érinti — a VedettUtvonalSearchForm/FavoriteRoutesPanel
// belseje nem módosul.
type TravelMode = "transit" | "car";

// AUTÓS MÓD IDEIGLENES KIKAPCSOLÁSA (2026-09-14) — a felhasználó kérésére a
// "🚗 Autó" választó gomb és a car ág EGYELŐRE nem jelenik meg a
// felületen. A MEGLÉVŐ car routing implementáció (Mapbox-hívás, route.ts,
// car-route tesztek) VÁLTOZATLANUL a kódban marad — ez KIZÁRÓLAG egy UI-
// szintű elrejtés, nincs törlés/refaktor. Visszakapcsoláshoz elég ezt
// `true`-ra állítani.
const CAR_ROUTING_ENABLED = false;

// AUTÓS ÚTVONALTERVEZÉS MVP (2026-09-14) — a "car" ág egyszerű Honnan?/
// Hová? cím-inputtal az ÚJ /api/admin/vedett-utvonal/car-route végpontot
// hívja (geokódolás + Mapbox driving-traffic route, lásd a route.ts
// fejléc-kommentjét). KÖRÖN KÍVÜL: VédettScore, sensory routing,
// turn-by-turn, GPS.
type CarRouteResult = {
  durationSeconds: number;
  distanceMeters: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

// CÍM AUTOCOMPLETE (2026-09-14) — a Honnan?/Hová? mezőkhöz gépelés közben
// (min. 3 karakter, 300ms debounce) legfeljebb 5 javaslatot kérünk az ÚJ
// /api/admin/vedett-utvonal/address-search végponttól (ami a MEGLÉVŐ
// geocodert használja). A hook mostantól KÖZÖS (lib/vedett-route/
// useAddressAutocomplete.ts) — a transit Honnan?/Hová? "Cím vagy hely"
// mezői (VedettUtvonalSearchForm.tsx) is ugyanezt használják.

// VÁLASZTHATÓ AUTÓS ÚTVONALAK (2026-09-14) — a route.ts akár 3 útvonalat ad
// vissza (Mapbox alternatives=true); a lista SORRENDJE pontosan a Mapbox
// válaszának sorrendje (nincs saját rangsorolás/elnevezés). Alapértelmezés:
// az első (index 0) route van kiválasztva. Egyszerre KIZÁRÓLAG a
// kiválasztott route geometriája rajzolódik ki.

export default function VedettUtvonalWorkspace({
  disabled,
  initialDestination,
}: {
  disabled: boolean;
  initialDestination: { name: string; latitude: number; longitude: number } | null;
}) {
  const [travelMode, setTravelMode] = useState<TravelMode>("transit");
  const [selectedPreset, setSelectedPreset] = useState<{ key: number; preset: FavoriteRoutePreset } | null>(null);

  const [carOriginAddress, setCarOriginAddress] = useState("");
  const [carDestinationAddress, setCarDestinationAddress] = useState("");
  const [carLoading, setCarLoading] = useState(false);
  const [carError, setCarError] = useState<string | null>(null);
  const [carRoutes, setCarRoutes] = useState<CarRouteResult[]>([]);
  const [selectedCarRouteIndex, setSelectedCarRouteIndex] = useState(0);

  const [originSuggestions, setOriginSuggestions] = useAddressAutocomplete(carOriginAddress, disabled || carLoading);
  const [destinationSuggestions, setDestinationSuggestions] = useAddressAutocomplete(carDestinationAddress, disabled || carLoading);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);

  function handleSelectFavorite(preset: FavoriteRoutePreset) {
    setSelectedPreset((prev) => ({ key: (prev?.key ?? 0) + 1, preset }));
  }

  async function handleCarRouteSubmit() {
    setCarError(null);
    setCarRoutes([]);
    if (!carOriginAddress.trim() || !carDestinationAddress.trim()) {
      setCarError("Add meg az indulási címet és a célcímet.");
      return;
    }
    setCarLoading(true);
    try {
      const res = await fetch("/api/admin/vedett-utvonal/car-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originAddress: carOriginAddress, destinationAddress: carDestinationAddress }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setCarError(data?.message ?? "Nem sikerült lekérni az autós útvonalat.");
        return;
      }
      setCarRoutes(data.routes);
      setSelectedCarRouteIndex(0);
    } catch {
      setCarError("Nem sikerült lekérni az autós útvonalat.");
    } finally {
      setCarLoading(false);
    }
  }

  const selectedCarRoute = carRoutes[selectedCarRouteIndex] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTravelMode("transit")}
          className={travelMode === "transit" ? "btn-primary text-sm" : "btn-secondary text-sm"}
        >
          🚌 Tömegközlekedés
        </button>
        {CAR_ROUTING_ENABLED && (
          <button
            type="button"
            onClick={() => setTravelMode("car")}
            className={travelMode === "car" ? "btn-primary text-sm" : "btn-secondary text-sm"}
          >
            🚗 Autó
          </button>
        )}
      </div>

      {CAR_ROUTING_ENABLED && travelMode === "car" ? (
        <div className="space-y-2">
          <div className="relative">
            <label className="block text-xs text-gray-500">Honnan?</label>
            <input
              type="text"
              value={carOriginAddress}
              onChange={(e) => {
                setCarOriginAddress(e.target.value);
                setShowOriginSuggestions(true);
              }}
              onFocus={() => setShowOriginSuggestions(true)}
              onBlur={() => setTimeout(() => setShowOriginSuggestions(false), 150)}
              placeholder="Indulási cím"
              disabled={disabled || carLoading}
              className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
            />
            {showOriginSuggestions && originSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-0.5 w-full rounded border border-gray-200 bg-white text-sm shadow-sm">
                {originSuggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setCarOriginAddress(s.label);
                        setOriginSuggestions([]);
                        setShowOriginSuggestions(false);
                      }}
                      className="block w-full px-2 py-1 text-left hover:bg-gray-50"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative">
            <label className="block text-xs text-gray-500">Hová?</label>
            <input
              type="text"
              value={carDestinationAddress}
              onChange={(e) => {
                setCarDestinationAddress(e.target.value);
                setShowDestinationSuggestions(true);
              }}
              onFocus={() => setShowDestinationSuggestions(true)}
              onBlur={() => setTimeout(() => setShowDestinationSuggestions(false), 150)}
              placeholder="Célcím"
              disabled={disabled || carLoading}
              className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
            />
            {showDestinationSuggestions && destinationSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-0.5 w-full rounded border border-gray-200 bg-white text-sm shadow-sm">
                {destinationSuggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setCarDestinationAddress(s.label);
                        setDestinationSuggestions([]);
                        setShowDestinationSuggestions(false);
                      }}
                      className="block w-full px-2 py-1 text-left hover:bg-gray-50"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={handleCarRouteSubmit} disabled={disabled || carLoading} className="btn-primary text-sm">
            {carLoading ? "Tervezés…" : "Útvonal tervezése"}
          </button>
          {carError && <p className="text-xs text-red-600">{carError}</p>}
          {carRoutes.length > 0 && (
            <ul className="space-y-1">
              {carRoutes.map((route, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setSelectedCarRouteIndex(i)}
                    className={i === selectedCarRouteIndex ? "btn-primary w-full text-left text-sm" : "btn-secondary w-full text-left text-sm"}
                  >
                    {i + 1}. útvonal – {Math.round(route.durationSeconds / 60)} perc –{" "}
                    {(route.distanceMeters / 1000).toFixed(1).replace(".", ",")} km
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedCarRoute && (
            <div className="rounded border border-sni-primary/30 bg-sni-primary/5 p-3 text-sm">
              <p className="font-semibold">Autós útvonal</p>
              <p>Menetidő: {Math.round(selectedCarRoute.durationSeconds / 60)} perc</p>
              <p>Távolság: {(selectedCarRoute.distanceMeters / 1000).toFixed(1).replace(".", ",")} km</p>
            </div>
          )}
          {selectedCarRoute && (
            // Ugyanaz a megosztott <VedettUtvonalMap> komponens/infrastruktúra,
            // mint a transit ágon — legs=[] (nincs transit-geometria autó
            // módban), carRouteGeometry a KIVÁLASZTOTT route LineString-je —
            // egyszerre KIZÁRÓLAG egy autós vonal rajzolódik ki.
            <VedettUtvonalMap
              legs={[]}
              carRouteGeometry={selectedCarRoute.geometry}
              className="h-[300px] w-full rounded border border-gray-200 sm:h-[360px] md:h-[450px]"
            />
          )}
        </div>
      ) : (
        <>
          <FavoriteRoutesPanel onSelect={handleSelectFavorite} />

          <VedettUtvonalSearchForm
            key={selectedPreset?.key ?? "initial"}
            disabled={disabled}
            initialDestination={selectedPreset ? null : initialDestination}
            initialFavoritePreset={selectedPreset?.preset ?? null}
          />
        </>
      )}
    </div>
  );
}
