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
    'Találd meg, milyen munkában tudsz jól működni. Nem álláshirdetős portál – karrierprofilos rendszer, amely a munkakörnyezeti preferenciáidra épül.',
}

// ─────────────────────────────────────────────────────────────────────────────
// How It Works lépések
// ─────────────────────────────────────────────────────────────────────────────
const FLOW_STEPS = [
  {
    num: '1',
    title: 'Munkaprofil',
    desc: 'Megadod, milyen munkakörülmények illenek hozzád – zajszint, menetrend, kommunikáció, fizikai terhelés és még 47 dimenzió.',
    href: '/vedett-karrier/munkaprofil',
  },
  {
    num: '2',
    title: 'Képességtérkép',
    desc: 'Megjelölöd, milyen készségeid vannak. Nem lisensz, nem vizsga – csak az, amit ténylegesen tudsz csinálni.',
    href: '/vedett-karrier/kepessegek',
  },
  {
    num: '3',
    title: 'Karrieriránytű',
    desc: 'A rendszer megmutatja, milyen munkakörcsaládok illenek a készségeidhez és érdeklődésedhez. Nem rangsor, nem diagnózis.',
    href: '/vedett-karrier/karrieriranytu',
  },
  {
    num: '4',
    title: 'Munkakörcsaládok',
    desc: '25 feladatminta-alapú munkakörcsalád: nem iparági kategória, hanem az határozza meg, mit csinálsz a munkában.',
    href: '/vedett-karrier/munkakorcsaladok',
  },
  {
    num: '5',
    title: 'Kompatibilitási Térkép',
    desc: 'Ha megnézel egy konkrét munkakört, a rendszer összeveti a munkáltató által megadott körülményeket a saját Munkaprofiloddal.',
    href: '/vedett-karrier/lehetosegek',
  },
  {
    num: '6',
    title: 'Preferencialap',
    desc: 'Egy rövid dokumentum, amelyen a saját munkavállalói preferenciáid szerepelnek. Te döntöd el, kivel osztod meg.',
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
          Nem álláshirdetős portál. A Védett Karrier a munkakörnyezeti preferenciáidra épül —
          megmutatja, mely munkakörök illenek a mindennapjaidhoz, és segít tájékozottan dönteni.
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
        <strong>Fontos tudni:</strong> A Védett Karrier nem munkaerő-közvetítő szolgáltatás.
        Nem garantál munkát, választ, interjút vagy munkaviszonyt.
        Nem alkalmassági vizsgálat és nem diagnózis.
        A rendszer a saját preferenciáidon alapuló tájékoztató eszköz.
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-center text-xl font-extrabold text-sni-brand-navy">
          Hogyan működik?
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Ez nem klasszikus állásportál. A folyamat a saját preferenciáiddal kezdődik.
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
          Munkakör-feltérképezésen átesett befogadó munkáltatók nyitott pozíciói.
          A Kompatibilitási Térkép eléréséhez Munkaprofil szükséges.
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
