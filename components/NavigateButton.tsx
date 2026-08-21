"use client";

import { Navigation } from "lucide-react";
import { useState } from "react";

interface Props {
  lat: number;
  lng: number;
  placeName: string;
}

export default function NavigateButton({ lat, lng, placeName }: Props) {
  const [open, setOpen] = useState(false);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(placeName)}`;
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const appleMapsUrl = `https://maps.apple.com/?daddr=${lat},${lng}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-sni-brand-teal bg-white px-3 py-1.5 text-sm font-semibold text-sni-brand-teal shadow-sm transition hover:bg-sni-brand-teal hover:text-white"
      >
        <Navigation size={14} />
        Navigálj oda
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute left-0 top-full z-50 mt-2 w-48 rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <img src="https://www.google.com/favicon.ico" alt="" className="h-4 w-4" />
              Google Maps
            </a>
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <img src="https://www.waze.com/favicon.ico" alt="" className="h-4 w-4" />
              Waze
            </a>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              🗺️ Apple Maps
            </a>
          </div>
        </>
      )}
    </div>
  );
}
