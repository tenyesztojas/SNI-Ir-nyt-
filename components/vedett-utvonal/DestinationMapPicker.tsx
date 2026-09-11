"use client";

// Védett Útvonal — Térképes célpont-kijelölő (Geocoding hardening, 2026-09-10,
// 11-13. pont; RUNTIME UX HOTFIX, 2026-09-10 — lásd lent).
//
// MIKOR jelenik meg: amikor a szerver (route.ts) egy ADDRESS_APPROXIMATE
// geokódolási eredményt adott a célhelyre — a település/utca igazolható,
// de a konkrét házszám nem (pl. Nominatim csak road/highway szintű
// találatot adott, ahogy az Alacskai út 63 production hiba esetén
// bizonyítottan történt, lásd geocode.ts fejléce). Egy ilyen közelítő
// koordinátát a szerver SOHA nem enged tovább a routingnak pontos célként
// — ez a komponens adja a felhasználónak a lehetőséget, hogy MAGA
// pontosítsa a helyet egy térképen, ahelyett hogy a rendszer találgatna.
//
// TÉRKÉP-INFRASTRUKTÚRA: szándékosan a MEGLÉVŐ MapLibre + OpenFreeMap
// beállítást használja (lib/vedett-route/mapStyle.ts, UGYANAZ a style URL/
// attribution, mint VedettUtvonalMap.tsx) — nincs második térképrendszer,
// nincs Google Maps (11. pont). Ez egy ÖNÁLLÓ, saját MapLibre instance —
// NEM osztja meg állapotot a fő útvonal-térképpel (VedettUtvonalMap), és
// nem remounteli azt; a kettő teljesen független életciklusú (a picker
// csak addig él, amíg a felhasználó a célt pontosítja, a fő térkép
// eközben változatlan marad).
//
// PRIVACY (16. pont): a kijelölt koordináta KIZÁRÓLAG a szülő komponens
// (VedettUtvonalSearchForm.tsx) React state-jébe kerül (destination:
// MAP_PICKED), amíg a felhasználó újra nem keres — nincs localStorage,
// nincs adatbázis-mentés, nincs analytics, nincs reverse geocode hívás.
//
// RUNTIME UX HOTFIX (2026-09-10) — valós böngészős tesztben bebizonyosodott
// root cause: a "Ez legyen a cél" gomb korábban `bg-sni-primary text-white`
// osztályokat használt. A `sni-primary` szín NINCS definiálva sehol
// (tailwind.config.ts theme.extend.colors.sni csak bg/blue/bluedark/green/
// greendark/beige/text/warn/brand.teal/brand.blue/brand.navy kulcsokat
// ismer, "primary" nincs köztük; app/globals.css sem definiál ilyen CSS
// változót/osztályt) — Tailwind ezért EGYETLEN szabályt sem generált a
// `bg-sni-primary`/`text-sni-primary` osztályokhoz, a gomb háttere
// transzparens/fehér maradt, a `text-white` felirat pedig fehér szövegként
// fehér/átlátszó alapon LÁTHATATLANNÁ vált — miközben a "Mégse" gomb valós,
// létező utility-osztályokat használt (border-gray-300/bg-white/
// text-gray-700), ezért az látszott. A gomb ELEM maga mindvégig a DOM-ban
// volt, csak vizuálisan nem volt kivehető. Javítás: a `.btn-primary`/
// `.btn-secondary` MEGLÉVŐ, bizonyítottan működő, globals.css-ben definiált
// osztályai (amik a valós sni-brand-teal/sni-brand-blue színeket
// használják), nem pedig egy nem létező "sni-primary" token.
//
// Emellett, a lehető legerősebb védelemként a jövőbeli hasonló hibák ellen,
// a footer MOSTANTÓL explicit `flex-shrink-0`-t kap (sosem nyomhatja ki a
// térkép-terület), a térkép-terület explicit `min-h-0`-t (a flexbox
// alapértelmezett `min-height: auto` viselkedése miatt, ami elméletileg
// kinyomhatná a footert), a külső konténer `h-dvh`-t is (a `fixed inset-0`
// mellett — mobil böngészők dinamikus címsora esetén az `inset-0` a LAYOUT
// viewportot veheti figyelembe, ami eltérhet a ténylegesen látható
// vizuális viewporttól; a `dvh` egység ezt kompenzálja), és a footer
// `env(safe-area-inset-bottom)`-ot is figyelembe vesz (PWA/telefon
// rendszer-navigáció ne takarhassa el).
//
// STATE-MODELL (RUNTIME UX HOTFIX, 3-4. pont) — KÜLÖN választva:
//   approximateLocation (a szülőtől kapott initialLat/initialLon) — KIZÁRÓLAG
//     a térkép kezdeti középpontjához és a marker kezdeti, TÁJÉKOZÓDÁSI
//     pozíciójához. Ez a Nominatim APPROXIMATE koordinátája — SOHA nem
//     számít automatikusan végleges, felhasználó által jóváhagyott célnak.
//   selectedPoint — KIZÁRÓLAG a felhasználó TÉNYLEGES kijelölése (map
//     click VAGY marker dragend után). Amíg ez null, a "Ez legyen a cél"
//     gomb MINDIG látható marad (nincs feltételesen eltüntetve), de
//     disabled — így a felhasználó világosan látja a lehetőséget, csak
//     addig nem tudja megnyomni, amíg nem választott ténylegesen pontot.

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL, MAP_ATTRIBUTION_FALLBACK } from "@/lib/vedett-route/mapStyle";

export interface DestinationMapPickerProps {
  initialLat: number;
  initialLon: number;
  onConfirm: (lat: number, lon: number) => void;
  onCancel: () => void;
  // GEOCODING GENERALIZÁCIÓ / SZIMMETRIA (2026-09-11) — a picker maga
  // mindvégig destination-agnosztikus logikájú volt (lásd fenti fejléc),
  // csak a COPY (szövegek) voltak célpont-specifikusak. Ez a mező
  // KIZÁRÓLAG a megjelenített szövegeket választja szét — a
  // térkép/marker/state-gép viselkedése (selectedPoint, drag/click,
  // onConfirm(lat, lon)) TELJESEN azonos indulás és célpont esetén (8.
  // pont: a két oldal szimmetrikus). Alapérték "destination", hogy a
  // MEGLÉVŐ (célpont) hívási helyek és tesztek változatlanul működjenek.
  mode?: "origin" | "destination";
}

export default function DestinationMapPicker({
  initialLat,
  initialLon,
  onConfirm,
  onCancel,
  mode = "destination",
}: DestinationMapPickerProps) {
  const isOrigin = mode === "origin";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // A felhasználó ÁLTAL TÉNYLEGESEN kijelölt pont — KÜLÖNBÖZIK a térkép
  // kezdeti (approximate) középpontjától. Amíg null, a confirm gomb
  // disabled (3-4. pont: "a Nominatim APPROXIMATE koordinátája önmagában
  // NE számítson automatikusan végleges célpontnak").
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [initialLon, initialLat],
      zoom: 16,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: MAP_ATTRIBUTION_FALLBACK }), "top-left");
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    // A marker KEZDETBEN a közelítő (Nominatim APPROXIMATE) koordinátán
    // jelenik meg, tájékozódási célból — de ez önmagában NEM jelent
    // kijelölést (selectedPoint marad null, amíg a felhasználó ténylegesen
    // nem kattint/húz).
    const marker = new maplibregl.Marker({ draggable: true, color: "#2563eb" })
      .setLngLat([initialLon, initialLat])
      .addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      setSelectedPoint({ lat, lon: lng });
    });
    markerRef.current = marker;

    // Térkép-kattintás is áthelyezi a markert (nem csak drag) — mobil
    // touch-on ez a legkönnyebben elérhető interakció (12. pont: "rábök /
    // kattint a kívánt pontra").
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      setSelectedPoint({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    map.on("click", handleMapClick);

    mapRef.current = map;

    return () => {
      map.off("click", handleMapClick);
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirmClick() {
    // 4. pont: "ha nincs selectedPoint: ne történjen routing" — a gomb
    // disabled állapota ezt már megelőzi, de a handler is védekezik (pl. ha
    // valamiért mégis triggerelődne egy disabled gombon egy assistive
    // technológia felől).
    if (!selectedPoint) return;
    onConfirm(selectedPoint.lat, selectedPoint.lon);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex h-dvh flex-col bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={isOrigin ? "Induló hely kijelölése a térképen" : "Célpont kijelölése a térképen"}
    >
      <div className="flex flex-shrink-0 items-center justify-between bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-medium text-gray-700">
          {isOrigin ? "Jelöld meg a pontos indulási helyet a térképen" : "Jelöld meg a pontos célt a térképen"}
        </p>
      </div>

      {/* min-h-0: flexbox alapértelmezett min-height:auto nélkül a
          térkép-terület elméletileg kinyomhatná a footert a látható
          területről — ez a szabály biztosítja, hogy a flex-1 ténylegesen
          zsugorodni is tudjon a rendelkezésre álló helyre. */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1"
        role="img"
        aria-label={isOrigin ? "Térkép — koppints vagy húzd a markert a pontos indulási helyre" : "Térkép — koppints vagy húzd a markert a pontos célra"}
      />

      {!selectedPoint && (
        <p className="flex-shrink-0 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          {isOrigin ? "Koppints a térképre, vagy húzd a markert a pontos indulási helyre." : "Koppints a térképre, vagy húzd a markert a pontos célra."}
        </p>
      )}

      {/* flex-shrink-0: a footer SOSEM nyomódhat ki a látható területről —
          sem a térkép, sem a fenti figyelmeztető sáv nem foghatja el a
          helyét. A safe-area-inset-bottom padding a rendszer alsó
          navigációs sávja (PWA/mobil) alá is biztosítja a láthatóságot. */}
      <div
        className="flex flex-shrink-0 gap-2 bg-white px-4 pt-3 shadow-sm"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button type="button" onClick={onCancel} className="btn-secondary min-h-[44px] flex-1">
          Mégse
        </button>
        <button
          type="button"
          onClick={handleConfirmClick}
          disabled={!selectedPoint}
          aria-disabled={!selectedPoint}
          className="btn-primary min-h-[44px] flex-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isOrigin ? "Ez legyen az indulás" : "Ez legyen a cél"}
        </button>
      </div>
    </div>
  );
}
