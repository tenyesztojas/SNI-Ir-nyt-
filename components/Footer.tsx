import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <img src="/logo.png" alt="VédettSarok" className="h-10 w-auto" />
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Közösségi tapasztalatok alapján működő helykereső autizmus- és ADHD-barát
              helyekhez — nem orvosi eszköz.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-8 text-sm">
            <div>
              <p className="font-bold text-gray-900">Helyek</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Link href="/helyek" className="text-gray-500 hover:text-sni-brand-blue hover:underline">
                  Keresés
                </Link>
                <Link href="/uj-hely" className="text-gray-500 hover:text-sni-brand-blue hover:underline">
                  Hely beküldése
                </Link>
                <Link href="/kedvencek" className="text-gray-500 hover:text-sni-brand-blue hover:underline">
                  Kedvenceim
                </Link>
              </div>
            </div>
            <div>
              <p className="font-bold text-gray-900">Fiók</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Link href="/belepes" className="text-gray-500 hover:text-sni-brand-blue hover:underline">
                  Belépés / Regisztráció
                </Link>
                <Link href="/profil" className="text-gray-500 hover:text-sni-brand-blue hover:underline">
                  Profilom
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-1 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">© 2026 VédettSarok — Minden jog fenntartva</p>
          <p className="text-xs text-gray-400">Nem orvosi, diagnosztikai vagy terápiás eszköz</p>
        </div>
      </div>
    </footer>
  );
}
