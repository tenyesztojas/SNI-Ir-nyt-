/**
 * Védett Karrier – Landing Page
 * /vedett-karrier
 *
 * Publikus (auth nélkül elérhető).
 * Nem álláshirdetős portal — karrierprofilos rendszer.
 *
 * Primary CTA: Munkaprofil kitöltése
 * Secondary CTA: Munkakörök felfedezése
 * Tertiary CTA: Munkáltatói felület
 *
 * NEM: AI matching, alkalmassági pontszám, „legjobb találat".
 */

import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Védett Karrier',
  description:
    'Találd meg, milyen munkában tudsz jól működni. Nem állásportál. A Védett Karrier segít meghatározni, milyen munkakörnyezetben tudsz jól dolgozni.',
}

// ─────────────────────────────────────────────────────────────────────────────
// How It Works lépések
// ─────────────────────────────────────────────────────────────────────────────
const FLOW_STEPS = [
  {
    num: '1',
    title: 'Munkaprofil',
    subtitle: 'Milyen munkakörülmények jók nekem?',
    desc: 'Megadod, milyen munkakörülmények jók neked. Például: zaj, munkarend, kommunikáció vagy fizikai terhelés. A profil további munkakörülményeket is megvizsgál.',
    href: '/vedett-karrier/munkaprofil',
  },
  {
    num: '2',
    title: 'Képességtérkép',
    subtitle: 'Mit tudok megcsinálni?',
    desc: 'Megjelölöd, mit tudsz megcsinálni. Ez nem vizsga. Nincs jó vagy rossz válasz.',
    href: '/vedett-karrier/kepessegek',
  },
  {
    num: '3',
    title: 'Karrieriránytű',
    subtitle: 'Milyen munkákat nézzek meg?',
    desc: 'A rendszer megmutatja, milyen munkakörtípusok illenek a készségeidhez és az érdeklődésedhez. Ez nem vizsga, nem rangsor és nem diagnózis.',
    href: '/vedett-karrier/karrieriranytu',
  },
  {
    num: '4',
    title: 'Munkakörtípusok',
    subtitle: 'Milyen feladatokat végezhetek?',
    desc: '25 különböző munkakörtípust nézhetsz meg. A csoportosítás alapja az, hogy milyen feladatokat végzel a munkában.',
    href: '/vedett-karrier/munkakorcsaladok',
  },
  {
    num: '5',
    title: 'Kompatibilitási Térkép',
    subtitle: 'Mennyire illenek hozzám ennek a munkának a körülményei?',
    desc: 'Ha megnézel egy konkrét munkakört, a rendszer összehasonlítja a munka körülményeit azzal, amit a Munkaprofilodban megadtál.',
    href: '/vedett-karrier/lehetosegek',
  },
  {
    num: '6',
    title: 'Munkakörülményeim',
    subtitle: 'Mit szeretnék megosztani?',
    desc: 'Egy rövid összefoglaló arról, milyen munkakörülmények jók neked. Te döntöd el, hogy megosztasz-e belőle valamit.',
    href: '/vedett-karrier/preferencialap',
  },
]

export default function VedettKarrierLanding() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">

      {/* ── HERO ──────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue px-8 py-14 text-center text-white">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sni-brand-teal">
          Védett Karrier
        </p>
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
          Találd meg, milyen munkában<br />tudsz jól működni.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-blue-100 leading-relaxed">
          Nem állásportál. A Védett Karrier segít meghatározni, milyen munkakörnyezetben tudsz jól dolgozni.
          Megmutatja, mely munkakörök illenek hozzád, és segít dönteni.
        </p>

        {/* Primary CTA */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/vedett-karrier/munkaprofil"
            className="rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-white hover:shadow-lg"
          >
            Elkészítem a Munkaprofilomat
          </Link>
          <Link
            href="/vedett-karrier/munkakorcsaladok"
            className="rounded-full border-2 border-white/40 px-8 py-3 font-bold text-white transition hover:bg-white/10"
          >
            Felfedezem a munkaköröket
          </Link>
          <Link
            href="/vedett-karrier/munkaltato"
            className="rounded-full border-2 border-white/40 px-8 py-3 font-bold text-white transition hover:bg-white/10"
          >
            Munkáltatóként belépek
          </Link>
        </div>
      </div>

      {/* ── JOGI DISZKLÉMER ──────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800 leading-relaxed">
        <strong>Fontos tudni:</strong> A Védett Karrier nem munkaközvetítő.
        Nem garantál munkát, választ, interjút vagy munkaviszonyt.
        Nem vizsga és nem diagnózis.
        A rendszer csak segít a döntésedben.
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-center text-xl font-extrabold text-sni-brand-navy">
          Hogyan működik?
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Nem klasszikus állásportál. Azzal kezded, hogy megadod, milyen munkakörülmények jók neked.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW_STEPS.map(step => (
            <Link
              key={step.num}
              href={step.href}
              className="group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-sni-brand-teal hover:shadow-sm"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-sni-brand-teal text-sm font-bold text-sni-brand-navy">
                {step.num}
              </div>
              <h3 className="font-bold text-gray-800 group-hover:text-sni-brand-teal transition-colors">
                {step.title}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-sni-brand-teal">
                {step.subtitle}
              </p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                {step.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── AKTUÁLIS LEHETŐSÉGEK (secondary, nem primary) ───── */}
      <section className="mt-14">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-sni-brand-navy">
            Aktuális munkalehetőségek
          </h2>
          <Link
            href="/vedett-karrier/lehetosegek"
            className="text-sm text-sni-brand-teal hover:underline"
          >
            Összes lehetőség →
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Munkáltatók által feltöltött munkalehetőségek.
          A Kompatibilitási Térkép megnézéséhez töltsd ki a Munkaprofilodat.
        </p>
      </section>

      {/* ── MUNKÁLTATÓKNAK ───────────────────────────────────── */}
      <section className="mt-10 rounded-2xl border border-gray-200 bg-white px-6 py-6">
        <h2 className="text-base font-bold text-gray-800 mb-2">Munkáltatóknak</h2>
        <p className="text-sm text-gray-600 mb-4">
          A Védett Karrier rendszerében a munkáltató nem hirdetést ad fel, hanem
          feltérképezi a munkakör tényleges körülményeit. Így a rendszer tájékozottan
          tudja megmutatni a jelölteknek, mire számíthatnak.
        </p>
        <Link
          href="/vedett-karrier/munkaltato"
          className="inline-block rounded-full bg-sni-brand-navy px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Munkáltatói felület →
        </Link>
      </section>

    </main>
  )
}
