"use client";

import Link from "next/link";
import { Navigation } from "lucide-react";
import { useState } from "react";

interface Props {
  lat: number;
  lng: number;
  placeName: string;
  // Védett Hely "Navigálj oda" -> Védett Útvonal integráció (2026-09-09).
  //
  // SZÁNDÉKOSAN nem itt (kliens komponensben) dől el, hogy egy hely
  // Budapesten van-e, vagy hogy VEDETT_ROUTE_ENABLED be van-e kapcsolva —
  // ez a hívó (app/helyek/[slug]/page.tsx, szerver komponens) döntése,
  // ami a Védett Hely strukturált `city` mezőjét és a meglévő
  // isVedettRouteFeatureEnabled() flaget nézi, majd VAGY egy kész,
  // előre összeállított deep-linket ad ide, VAGY undefined/null-t, ha az
  // opciónak nem szabad megjelennie. A NavigateButton emiatt NEM
  // duplikálja/nem tartalmazza semmilyen auth-, feature-flag- vagy
  // Budapest-ellenőrző logikát — pusztán megjelenít egy már kész linket,
  // vagy nem jelenít meg semmit.
  vedettUtvonalHref?: string | null;
}

export default function NavigateButton({ lat, lng, placeName, vedettUtvonalHref }: Props) {
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
          <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl">
            {/* Védett Útvonal — ÚJ, TOVÁBBI opció a meglévő navigációs
                lehetőségek MELLETT (nem lecserélve azokat). Csak akkor
                renderelődik, ha a hívó kész linket adott (budapesti hely,
                bekapcsolt flag) — lásd a Props fenti magyarázatát. Ugyanaz
                az app, ezért Next.js <Link>-kel, ÚJ TAB NÉLKÜL navigálunk
                (nem external, mint a többi opció). */}
            {vedettUtvonalHref && (
              <>
                <Link
                  href={vedettUtvonalHref}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-4 py-2.5 text-sm font-medium text-sni-brand-teal hover:bg-sni-brand-teal/5 focus:bg-sni-brand-teal/5 focus:outline-none"
                >
                  <span aria-hidden="true" className="mt-0.5">🧭</span>
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-semibold">
                      Védett Útvonal
                      <span className="rounded bg-sni-brand-teal/15 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-sni-brand-teal">
                        BÉTA
                      </span>
                    </span>
                    <span className="text-xs font-normal text-gray-500">
                      Útvonaltervezés szenzoros szempontokkal
                    </span>
                  </span>
                </Link>
                <div className="my-1 border-t border-gray-100" />
              </>
            )}
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
