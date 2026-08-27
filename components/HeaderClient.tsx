"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Menu, X, LogOut, ChevronDown, BookOpen, MapPin } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import AccessibilityButton from "@/components/accessibility/AccessibilityButton";

// ── Védett Helyek dropdown ──────────────────────────────────────────────────
// FEJLESZTŐI MEGJEGYZÉS: A "Védett Útvonal" szándékosan NEM szerepel itt.
// A Védett Útvonal külön release gate-en esik át, csak annak teljes elkészülte
// és külön döntés után kerülhet negyedik elemként ide.
const VEDETT_HELYEK = [
  { href: "/helyek",    label: "Helyek keresése" },
  { href: "/uj-hely",  label: "Hely beküldése" },
  { href: "/kedvencek", label: "Kedvenceim" },
];

// ── Tudásbázis dropdown ─────────────────────────────────────────────────────
const TUDASBAZIS = [
  { href: "/tudasbazis/autizmus",              label: "Mi az autizmus?" },
  { href: "/tudasbazis/adhd",                  label: "Mi az ADHD?" },
  { href: "/tudasbazis/emelt-csaladi-potlek",  label: "Emelt családi pótlék igénylése" },
  { href: "/tudasbazis/mak-kartya",            label: "MÁK-kártya igénylése" },
  { href: "/tudasbazis/gyod",                  label: "GYOD igénylése" },
  { href: "/tudasbazis/sni-tajekoztato",       label: "SNI tájékoztató" },
  { href: "/tudasbazis/iranytu-szolgaltatoknak", label: "Iránytű szolgáltatóknak" },
];

// ── Egyszerű top-level linkek (sorrend: spec alapján) ──────────────────────
const TOP_LINKS = [
  { href: "/kozosseg",       label: "Közösség",      newTab: false },
  { href: "/programajanlok", label: "Programajánló", newTab: true  },
];

// Pilot/pre-launch linkek — csak adminnak láthatók, közvetlen link megosztáshoz
const ADMIN_PILOT_LINKS = [
  { href: "/szolgaltato/regisztracio", label: "Védett Partner", newTab: false },
  { href: "/vedett-jelzes",            label: "Védett Jelzés",  newTab: false },
];

export default function HeaderClient({
  isLoggedIn,
  displayName,
  isAdmin,
  communityUnread = 0,
}: {
  isLoggedIn: boolean;
  displayName?: string | null;
  isAdmin: boolean;
  communityUnread?: number;
}) {
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [vhDesktopOpen, setVhDesktopOpen] = useState(false);
  const [vhMobileOpen,  setVhMobileOpen]  = useState(false);
  const [tbDesktopOpen, setTbDesktopOpen] = useState(false);
  const [tbMobileOpen,  setTbMobileOpen]  = useState(false);

  const vhRef = useRef<HTMLDivElement>(null);
  const tbRef = useRef<HTMLDivElement>(null);

  // Kattintáson kívül zárja be a desktop dropdownokat
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (vhRef.current && !vhRef.current.contains(e.target as Node)) setVhDesktopOpen(false);
      if (tbRef.current && !tbRef.current.contains(e.target as Node)) setTbDesktopOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape billentyű — mindkét dropdown bezárul
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setVhDesktopOpen(false); setTbDesktopOpen(false); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">

        {/* Logó */}
        <Link href="/" className="flex shrink-0 items-center" onClick={closeMobile}>
          <img src="/logo.png" alt="VédettSarok" className="h-10 w-auto" />
        </Link>

        {/* ── DESKTOP navigáció ──────────────────────────────────────── */}
        <nav className="hidden items-center gap-1 sm:flex">

          {/* 1. Védett Helyek dropdown */}
          <div className="relative" ref={vhRef}>
            <button
              onClick={() => setVhDesktopOpen((v) => !v)}
              aria-expanded={vhDesktopOpen}
              aria-controls="vh-dropdown"
              className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
            >
              <MapPin size={15} />
              Védett Helyek
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${vhDesktopOpen ? "rotate-180" : ""}`}
              />
            </button>
            {vhDesktopOpen && (
              <div
                id="vh-dropdown"
                role="menu"
                className="absolute left-0 top-full z-50 mt-2 w-52 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
              >
                {VEDETT_HELYEK.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setVhDesktopOpen(false)}
                    className="block px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue focus:outline-none focus:bg-gray-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 2. Egyszerű top-level linkek */}
          {TOP_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.newTab ? "_blank" : undefined}
              rel={link.newTab ? "noopener noreferrer" : undefined}
              className="relative rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
            >
              {link.label}
              {link.href === "/kozosseg" && communityUnread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                  {communityUnread > 99 ? "99+" : communityUnread}
                </span>
              )}
            </Link>
          ))}

          {/* 2b. Pilot linkek — csak adminnak (pre-launch megosztáshoz) */}
          {isAdmin && ADMIN_PILOT_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative rounded-full px-4 py-2 text-sm font-semibold text-sni-brand-teal transition-colors hover:bg-sni-brand-teal/10"
            >
              {link.label}
            </Link>
          ))}

          {/* 3. Admin (csak adminnak) */}
          {isAdmin && (
            <Link
              href="/admin"
              className="relative rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
            >
              Admin
            </Link>
          )}

          {/* 4. Tudásbázis dropdown */}
          <div className="relative" ref={tbRef}>
            <button
              onClick={() => setTbDesktopOpen((v) => !v)}
              aria-expanded={tbDesktopOpen}
              aria-controls="tb-dropdown"
              className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
            >
              <BookOpen size={15} />
              Tudásbázis
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${tbDesktopOpen ? "rotate-180" : ""}`}
              />
            </button>
            {tbDesktopOpen && (
              <div
                id="tb-dropdown"
                role="menu"
                className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
              >
                {TUDASBAZIS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setTbDesktopOpen(false)}
                    className="block px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue focus:outline-none focus:bg-gray-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 5. Auth: profil név + kilépés VAGY belépés */}
          {isLoggedIn ? (
            <>
              <Link
                href="/profil"
                className="ml-1 rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
              >
                {displayName ?? "Profilom"}
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <LogOut size={15} /> Kilépés
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/belepes"
              className="ml-2 inline-flex items-center rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-sni-brand-blue hover:shadow-lg"
            >
              Belépés
            </Link>
          )}

          {/* Akadálymentességi gomb */}
          <div className="ml-2">
            <AccessibilityButton />
          </div>
        </nav>

        {/* ── Hamburger + akadálymentességi gomb — mobil ────────────── */}
        <div className="flex items-center gap-2 sm:hidden">
          <AccessibilityButton />
          <div className="relative">
            <button
              className="rounded-full p-2 text-gray-700 transition hover:bg-gray-100"
              aria-label={mobileOpen ? "Menü bezárása" : "Menü megnyitása"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            {!mobileOpen && communityUnread > 0 && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
                {communityUnread > 99 ? "99+" : communityUnread}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── MOBIL menü ─────────────────────────────────────────────────── */}
      {mobileOpen && (
        <nav className="border-t border-gray-100 bg-white px-4 pb-4 sm:hidden">
          <div className="flex flex-col gap-1 pt-2">

            {/* Védett Helyek accordion */}
            <div>
              <button
                onClick={() => setVhMobileOpen((v) => !v)}
                aria-expanded={vhMobileOpen}
                aria-controls="vh-mobile"
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <MapPin size={18} className="text-sni-brand-teal" />
                  Védett Helyek
                </span>
                <ChevronDown
                  size={18}
                  className={`text-gray-400 transition-transform duration-200 ${vhMobileOpen ? "rotate-180" : ""}`}
                />
              </button>
              {vhMobileOpen && (
                <div id="vh-mobile" className="ml-4 flex flex-col gap-0.5 border-l-2 border-sni-brand-teal/30 pl-3">
                  {VEDETT_HELYEK.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobile}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Top-level linkek */}
            {TOP_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.newTab ? "_blank" : undefined}
                rel={link.newTab ? "noopener noreferrer" : undefined}
                onClick={closeMobile}
                className="relative flex items-center justify-between rounded-xl px-4 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
              >
                {link.label}
                {link.href === "/kozosseg" && communityUnread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white leading-none">
                    {communityUnread > 99 ? "99+" : communityUnread}
                  </span>
                )}
              </Link>
            ))}

            {/* Pilot linkek — csak adminnak */}
            {isAdmin && ADMIN_PILOT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobile}
                className="rounded-xl px-4 py-3 text-base font-semibold text-sni-brand-teal hover:bg-sni-brand-teal/10"
              >
                {link.label}
              </Link>
            ))}

            {/* Admin */}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={closeMobile}
                className="rounded-xl px-4 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
              >
                Admin
              </Link>
            )}

            {/* Tudásbázis accordion */}
            <div>
              <button
                onClick={() => setTbMobileOpen((v) => !v)}
                aria-expanded={tbMobileOpen}
                aria-controls="tb-mobile"
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <BookOpen size={18} className="text-sni-brand-teal" />
                  Tudásbázis
                </span>
                <ChevronDown
                  size={18}
                  className={`text-gray-400 transition-transform duration-200 ${tbMobileOpen ? "rotate-180" : ""}`}
                />
              </button>
              {tbMobileOpen && (
                <div id="tb-mobile" className="ml-4 flex flex-col gap-0.5 border-l-2 border-sni-brand-teal/30 pl-3">
                  {TUDASBAZIS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { closeMobile(); setTbMobileOpen(false); }}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Auth mobil */}
            {isLoggedIn ? (
              <>
                <Link
                  href="/profil"
                  onClick={closeMobile}
                  className="rounded-xl px-4 py-3 text-base font-semibold text-sni-brand-blue"
                >
                  {displayName ?? "Profilom"}
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-xl px-4 py-3 text-left text-base font-semibold text-red-500"
                  >
                    Kijelentkezés
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/belepes"
                onClick={closeMobile}
                className="mt-2 flex items-center justify-center rounded-full bg-sni-brand-teal py-3 text-base font-bold text-white"
              >
                Belépés / Regisztráció
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
