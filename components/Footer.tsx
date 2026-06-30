import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-sm text-gray-600">
          A VédettSarok közösségi tapasztalatok alapján működik — nem orvosi, diagnosztikai
          vagy terápiás eszköz. Minden gyermek és felnőtt más: indulás előtt mindig érdemes
          előzetesen rákérdezni az aktuális körülményekre.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-sni-brand-blue">
          <Link href="/" className="hover:underline">
            Kezdőlap
          </Link>
          <Link href="/helyek" className="hover:underline">
            Helyek keresése
          </Link>
          <Link href="/uj-hely" className="hover:underline">
            Hely beküldése
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400">© 2026 VédettSarok</p>
      </div>
    </footer>
  );
}
