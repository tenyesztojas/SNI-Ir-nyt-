"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Menu, X, LogOut, ChevronDown, BookOpen } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";

const TUDASBAZIS = [
  { href: "/tudasbazis/autizmus", label: "Mi az autizmus?" },
  { href: "/tudasbazis/adhd", label: "Mi az ADHD?" },
  { href: "/tudasbazis/emelt-csaladi-potlek", label: "Emelt családi pótlék igénylése" },
  { href: "/tudasbazis/mak-kartya", label: "MÁK-kártya igénylése" },
  { href: "/tudasbazis/gyod", label: "GYOD igénylése" },
  { href: "/tudasbazis/sni-tajekoztato", label: "SNI tájékoztató" },
];

const navLinks = [
  { href: "/helyek", label: "Helyek keresése" },
  { href: "/uj-hely", label: "Hely beküldése" },
  { href: "/kedvencek", label: "Kedvenceim" },
  { href: "/programajanlok", label: "Programajánló", newTab: true },
  { href: "/rolunk", label: "Rólunk" },
  { href: "/kapcsolat", label: "Kapcsolat" },
];

export default function HeaderClient({
  isLoggedIn,
  displayName,
  isAdmin,
}: {
  isLoggedIn: boolean;
  displayName?: string | null;
  isAdmin: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tbDesktopOpen, setTbDesktopOpen] = useState(false);
  const [tbMobileOpen, setTbMobileOpen] = useState(false);
  const tbRef = useRef<HTMLDivElement>(null);

  const links = isAdmin ? [...navLinks, { href: "/admin", label: "Admin", newTab: false }] : navLinks;

  // Kattintáson kívül zárja be a desktop dropdownt
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tbRef.current && !tbRef.current.contains(e.target as Node)) {
        setTbDesktopOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape billentyű
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTbDesktopOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logó */}
        <Link href="/" className="flex items-center" onClick={() => setMobileOpen(false)}>
          <img src="/logo.png" alt="VédettSarok" className="h-12 w-auto" />
        </Link>

        {/* Desktop navigáció */}
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.newTab ? "_blank" : undefined}
              rel={link.newTab ? "noopener noreferrer" : undefined}
              className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
            >
              {link.label}
            </Link>
          ))}

          {/* Tudásbázis dropdown */}
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

          {/* Auth */}
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
        </nav>

        {/* Hamburger */}
        <button
          className="rounded-full p-2 text-gray-700 transition hover:bg-gray-100 sm:hidden"
          aria-label={mobileOpen ? "Menü bezárása" : "Menü megnyitása"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobil menü */}
      {mobileOpen && (
        <nav className="border-t border-gray-100 bg-white px-4 pb-4 sm:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.newTab ? "_blank" : undefined}
                rel={link.newTab ? "noopener noreferrer" : undefined}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
              >
                {link.label}
              </Link>
            ))}

            {/* Tudásbázis mobil accordion */}
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
                      onClick={() => { setMobileOpen(false); setTbMobileOpen(false); }}
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
                  onClick={() => setMobileOpen(false)}
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
                onClick={() => setMobileOpen(false)}
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
