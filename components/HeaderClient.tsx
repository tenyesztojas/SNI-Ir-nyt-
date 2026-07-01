"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";

const navLinks = [
  { href: "/helyek", label: "Helyek keresése" },
  { href: "/uj-hely", label: "Hely beküldése" },
  { href: "/kedvencek", label: "Kedvenceim" },
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
  const [open, setOpen] = useState(false);

  const links = isAdmin ? [...navLinks, { href: "/admin", label: "Admin" }] : navLinks;

  return (
    <header className="sticky top-0 z-40 bg-white shadow-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          <img src="/logo.png" alt="VédettSarok" className="h-14 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-sni-brand-blue"
            >
              {link.label}
            </Link>
          ))}
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

        <button
          className="rounded-full p-2 text-gray-700 transition hover:bg-gray-100 sm:hidden"
          aria-label={open ? "Menü bezárása" : "Menü megnyitása"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-gray-100 bg-white px-4 pb-4 sm:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 hover:text-sni-brand-blue"
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <>
                <Link
                  href="/profil"
                  onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
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
