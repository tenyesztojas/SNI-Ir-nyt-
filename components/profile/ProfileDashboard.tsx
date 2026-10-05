"use client";

// Kompakt profil-dashboard: reszponzív csempe-rács (mobil 1 oszlop, sm+ 2 oszlop).
// A panelek tartalmát (meglévő űrlapok/listák) a szerver-oldali oldal adja át;
// ez a komponens kizárólag a megjelenítést és a kinyitást kezeli.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, MapPin, Star, Trash2, UserCircle, Users } from "lucide-react";

type PanelKey = "profile" | "password" | "places" | "reviews" | "delete";

interface Props {
  profileLabel: string;
  hasFamilyAccess: boolean;
  placesCount: number;
  reviewsCount: number;
  panels: Record<PanelKey, ReactNode>;
}

const PANEL_TITLES: Record<PanelKey, string> = {
  profile: "Névbeállítások és hírlevél",
  password: "Jelszó módosítása",
  places: "Beküldött helyek",
  reviews: "Értékeléseim",
  delete: "Fiók törlése",
};

const tileBase =
  "group flex min-h-[72px] w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-soft transition-all duration-200 " +
  "hover:border-sni-brand-teal/40 hover:shadow-softHover focus:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal focus-visible:ring-offset-2";

export default function ProfileDashboard({ profileLabel, hasFamilyAccess, placesCount, reviewsCount, panels }: Props) {
  const [active, setActive] = useState<PanelKey | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A /fiok-torles oldal a /profil#fiok-torlese címre irányít: ilyenkor a
  // Fiók törlése panel automatikusan megnyílik.
  useEffect(() => {
    if (window.location.hash === "#fiok-torlese") setActive("delete");
  }, []);

  useEffect(() => {
    if (active) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const toggle = (k: PanelKey) => setActive((cur) => (cur === k ? null : k));

  const tiles: { key: PanelKey; icon: ReactNode; title: string; sub: string; danger?: boolean }[] = [
    { key: "profile", icon: <UserCircle size={26} />, title: "Profiladatok", sub: profileLabel },
    { key: "password", icon: <KeyRound size={26} />, title: "Jelszó módosítása", sub: "Új jelszó beállítása" },
    { key: "places", icon: <MapPin size={26} />, title: "Beküldött helyek", sub: `${placesCount} beküldött hely` },
    { key: "reviews", icon: <Star size={26} />, title: "Értékeléseim", sub: `${reviewsCount} értékelés` },
  ];

  const tileButton = (t: { key: PanelKey; icon: ReactNode; title: string; sub: string; danger?: boolean }) => {
    const open = active === t.key;
    return (
      <button
        key={t.key}
        type="button"
        aria-expanded={open}
        aria-controls="profile-panel"
        onClick={() => toggle(t.key)}
        className={`${tileBase} ${
          t.danger ? "border-red-100 hover:border-red-300" : open ? "border-sni-brand-teal" : "border-gray-100"
        }`}
      >
        <span className={`shrink-0 ${t.danger ? "text-red-600" : "text-sni-brand-blue"}`}>{t.icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block font-bold ${t.danger ? "text-red-700" : "text-gray-900"}`}>{t.title}</span>
          <span className="block truncate text-sm text-gray-500">{t.sub}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tileButton(tiles[0])}
        {hasFamilyAccess ? (
          <Link href="/csalad" className={`${tileBase} border-gray-100`}>
            <span className="shrink-0 text-sni-brand-blue">
              <Users size={26} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-gray-900">Család</span>
              <span className="block truncate text-sm text-gray-500">Családtagok és gyermekprofilok</span>
            </span>
            <ArrowRight className="shrink-0 text-sni-brand-blue" size={18} />
          </Link>
        ) : null}
        {tileButton(tiles[1])}
        {tileButton(tiles[2])}
        {tileButton(tiles[3])}
        {tileButton({
          key: "delete",
          icon: <Trash2 size={26} />,
          title: "Fiók törlése",
          sub: "Végleges, külön megerősítéssel",
          danger: true,
        })}
      </div>

      {active && (
        <div
          id="profile-panel"
          ref={panelRef}
          role="region"
          aria-label={PANEL_TITLES[active]}
          className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-soft sm:p-6 [&>div]:!mt-0 [&>div]:!border-0 [&>div]:!p-0 [&>div]:!shadow-none"
        >
          {panels[active]}
        </div>
      )}
    </div>
  );
}
