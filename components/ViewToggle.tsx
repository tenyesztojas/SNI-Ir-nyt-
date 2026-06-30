"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { List, Map as MapIcon } from "lucide-react";
import { Place, Category } from "@/lib/types";

const PlacesMapInner = dynamic(() => import("./PlacesMapInner"), {
  ssr: false,
  loading: () => (
    <div className="card flex h-[28rem] flex-col items-center justify-center gap-2 text-center text-gray-500">
      <MapIcon size={32} className="text-sni-brand-blue" />
      <p className="font-medium">Térkép betöltése...</p>
    </div>
  ),
});

export default function ViewToggle({
  listView,
  places,
  categories,
}: {
  listView: React.ReactNode;
  places: Place[];
  categories: Category[];
}) {
  const [view, setView] = useState<"lista" | "terkep">("lista");
  const withCoords = places.filter(
    (p) => typeof p.latitude === "number" && typeof p.longitude === "number"
  );

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl2 border border-gray-300 bg-white p-1 shadow-soft">
        <button
          onClick={() => setView("lista")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            view === "lista"
              ? "bg-gradient-to-br from-sni-brand-teal to-sni-brand-navy text-white shadow-soft"
              : "text-sni-text hover:bg-sni-brand-teal/10"
          }`}
        >
          <List size={16} /> Lista
        </button>
        <button
          onClick={() => setView("terkep")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            view === "terkep"
              ? "bg-gradient-to-br from-sni-brand-teal to-sni-brand-navy text-white shadow-soft"
              : "text-sni-text hover:bg-sni-brand-teal/10"
          }`}
        >
          <MapIcon size={16} /> Térkép
        </button>
      </div>

      {view === "lista" ? (
        listView
      ) : places.length === 0 ? (
        <div className="card flex h-80 flex-col items-center justify-center gap-2 text-center text-gray-500">
          <MapIcon size={32} className="text-sni-brand-blue" />
          <p className="font-medium">Nincs a szűrésnek megfelelő hely.</p>
        </div>
      ) : (
        <div>
          {withCoords.length < places.length && (
            <p className="mb-3 text-sm text-gray-500">
              {withCoords.length} / {places.length} helynek van térképi koordinátája — a többi
              hamarosan kerül fel.
            </p>
          )}
          <PlacesMapInner places={places} categories={categories} />
        </div>
      )}
    </div>
  );
}
