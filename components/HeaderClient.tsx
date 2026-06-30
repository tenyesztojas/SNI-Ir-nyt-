"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";

const navLinks = [
  { href: "/helyek", label: "Helyek keresése" },
  { href: "/uj-hely", label: "Új hely beküldése" },
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
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-sni-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          <img src="/logo.png" alt="VédettSarok" className="h-14 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl2 px-4 py-2 text-sm font-medium text-sni-text hover:bg-sni-blue/60"
            >
              {link.label}
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              <Link href="/profil" className="rounded-xl2 px-4 py-2 text-sm font-medium text-sni-text hover:bg-sni-blue/60">
                {displayName ?? "Profilom"}
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="ml-2 btn-secondary px-4 py-2 text-sm">
                  <LogOut size={16} /> Kijelentkezés
                </button>
              </form>
            </>
          ) : (
            <Link href="/belepes" className="ml-2 btn-primary px-4 py-2 text-sm">
              Belépés
            </Link>
          )}
        </nav>

        <button
          className="rounded-xl2 p-2 text-sni-text hover:bg-sni-blue/60 sm:hidden"
          aria-label={open ? "Menü bezárása" : "Menü megnyitása"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-gray-200 bg-sni-bg px-4 pb-4 sm:hidden">
          <div className="flex flex-col gap-1 pt-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl2 px-4 py-3 text-base font-medium text-sni-text hover:bg-sni-blue/60"
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <>
                <Link
                  href="/profil"
                  onClick={() => setOpen(false)}
                  className="rounded-xl2 px-4 py-3 text-base font-medium text-sni-brand-blue"
                >
                  {displayName ?? "Profilom"}
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="rounded-xl2 px-4 py-3 text-left text-base font-medium text-sni-warn"
                  >
                    Kijelentkezés
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/belepes"
                onClick={() => setOpen(false)}
                className="rounded-xl2 px-4 py-3 text-base font-medium text-sni-brand-blue"
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
