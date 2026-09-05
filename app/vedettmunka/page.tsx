import Link from "next/link";
import { getPublishedJobs, getMyJobAlert, getMyEmployer } from "@/lib/vedettmunka/data";
import { createClient } from "@/lib/supabase/server";
import ErtesitoCta from "./ErtesitoCta";

export const metadata = {
  title: "VédettKarrier – Rugalmas munkák és lehetőségek",
};

export const dynamic = "force-dynamic";

export default async function VedettMunkaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [recentJobs, myAlert, myEmployer] = await Promise.all([
    getPublishedJobs({}),
    user ? getMyJobAlert() : Promise.resolve(null),
    user ? getMyEmployer() : Promise.resolve(null),
  ]);
  const latestJobs = recentJobs.slice(0, 3);
  const alertEnabled: boolean | null = user === null ? null
    : myAlert?.enabled === true ? true : false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue px-8 py-14 text-center text-white">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sni-brand-teal">
          VédettKarrier
        </p>
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
          Találj olyan munkát,<br />amely jobban illik a családod mindennapjaihoz.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-blue-100 leading-relaxed">
          Itt olyan lehetőségeket találsz, amelyek lehetnek otthonról végezhetők,
          részmunkaidősek, előre tervezhetők vagy rugalmasak.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/vedettmunka/allasok"
            className="rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-white hover:shadow-lg"
          >
            Lehetőségeket keresek
          </Link>
          <Link
            href="/vedettmunka/munkaltatok"
            className="rounded-full border-2 border-white/40 px-8 py-3 font-bold text-white transition hover:bg-white/10"
          >
            Karrierpartner leszek
          </Link>
          <Link
            href="/vedettmunka/oneletrajz"
            className="rounded-full border-2 border-white/40 px-8 py-3 font-bold text-white transition hover:bg-white/10"
          >
            Bemutatkozó lapot készítek
          </Link>
        </div>
      </div>

      {/* ── JOGI DISZKLÉMER ──────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-800 leading-relaxed">
        <strong>Fontos tudni:</strong> A VédettSarok nem munkaerő-közvetítő szolgáltatás.
        Nem garantál munkát, választ, interjút vagy munkaviszonyt.
        A VédettKarrier lehetőségeket mutat meg, bemutatkozó lap készítésében segít,
        és a jelentkezésedet technikailag továbbítja a hirdető partnernek.
      </div>

      {/* ── MIT TUDHATSZ MEG EGY LEHETŐSÉGRŐL? ─────────────── */}
      <section className="mt-14">
        <h2 className="text-center text-xl font-extrabold text-sni-brand-navy">
          Mit tudhatsz meg egy lehetőségről?
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Minden lehetőségkártyán megtalálod ezeket az információkat.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { title: "Mit kell csinálni?",          desc: "Egyszerűen leírják, milyen feladatok lesznek." },
            { title: "Mikor kell dolgozni?",         desc: "Megtudhatsz a munkarendről és a beosztásról." },
            { title: "Hol lehet dolgozni?",          desc: "Helyszínen, otthonról vagy vegyes formában." },
            { title: "Mennyi időt kér?",             desc: "Napi és heti óraszám, részmunkaidő lehetősége." },
            { title: "Kell sokat telefonálni?",      desc: "Megmutatják, mennyi kommunikáció jár a munkával." },
            { title: "Miben segítenek az elején?",   desc: "Van-e betanítás, kijelölt kapcsolattartó, írásos feladatleírás." },
          ].map(({ title, desc }) => (
            <div
              key={title}
              className="flex flex-col rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden"
            >
              <div className="flex items-center justify-center bg-sni-brand-teal/10 py-5 px-4">
                <span className="text-2xl font-extrabold text-sni-brand-teal">?</span>
              </div>
              <div className="p-4">
                <p className="text-sm font-bold text-sni-brand-navy leading-snug">{title}</p>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LEGÚJABB LEHETŐSÉGEK ─────────────────────────────── */}
      {latestJobs.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-sni-brand-navy">Legújabb lehetőségek</h2>
            <Link href="/vedettmunka/allasok" className="text-sm font-semibold text-sni-brand-teal hover:underline">
              Összes →
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {latestJobs.map((job) => (
              <Link
                key={job.id}
                href={`/vedettmunka/allasok/${job.id}`}
                className="group flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-soft transition hover:border-sni-brand-teal/40 hover:shadow-softHover"
              >
                <div>
                  <p className="font-bold text-sni-brand-navy group-hover:text-sni-brand-teal">{job.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {(job.employers as { company_name: string } | null)?.company_name} · {job.city}
                  </p>
                </div>
                <span className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  job.work_type === "szellemi" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {job.work_type === "szellemi" ? "Szellemi" : "Fizikai"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── LEHETŐSÉGFIGYELŐ ─────────────────────────────────── */}
      <ErtesitoCta initialEnabled={alertEnabled} />

      {/* ── KARRIERIRÁNYTŰ ───────────────────────────────────── */}
      <section className="mt-4 rounded-2xl border border-sni-brand-teal/20 bg-sni-brand-teal/5 p-6 flex items-start gap-4">
        <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-sni-brand-teal/20 text-2xl">
          🧭
        </div>
        <div>
          <h3 className="font-bold text-sni-brand-navy">Karrieriránytű</h3>
          <p className="mt-1 text-sm text-gray-600">
            Segít átgondolni, milyen munka illik jobban a mindennapjaidhoz. Nincs pontozás, nincs diagnózis — csak kérdések és keresési szempontok.
          </p>
          <Link
            href="/vedettmunka/karrieriranytu"
            className="mt-3 inline-block rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
          >
            Megpróbálom
          </Link>
        </div>
      </section>

      {/* ── BEMUTATKOZÓ LAP ──────────────────────────────────── */}
      <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 flex items-start gap-4">
        <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-sni-brand-blue/10 text-2xl">
          📄
        </div>
        <div>
          <h3 className="font-bold text-sni-brand-navy">Bemutatkozó lap készítő</h3>
          <p className="mt-1 text-sm text-gray-600">
            Készíts egyszerű, átlátható bemutatkozó lapot, amit csatolhatsz egy VédettKarrier lehetőséghez.
            Az adataid a böngésződben maradnak, mi nem tároljuk.
          </p>
          <Link
            href="/vedettmunka/oneletrajz"
            className="mt-3 inline-block rounded-full bg-sni-brand-navy px-5 py-2 text-sm font-semibold text-white transition hover:bg-sni-brand-blue"
          >
            Bemutatkozó lapot készítek
          </Link>
        </div>
      </section>

      {/* ── KARRIERPARTNER / MUNKÁLTATÓI PROFIL ─────────────── */}
      {myEmployer ? (
        <section className="mt-8 rounded-2xl bg-sni-brand-navy p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-sni-brand-teal mb-1">Karrierpartner fiók</p>
          <h2 className="text-lg font-extrabold">{myEmployer.company_name}</h2>
          {myEmployer.status === "approved" ? (
            <>
              <p className="mt-1 text-sm text-blue-100">A profilod jóváhagyva. Feladhatsz új lehetőségkártyát.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/vedettmunka/hirdetes-feladas"
                  className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-white"
                >
                  + Új lehetőségkártya
                </Link>
                <Link
                  href="/admin/vedettmunka/hirdetesek"
                  className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Lehetőségkártyáim
                </Link>
              </div>
            </>
          ) : myEmployer.status === "pending_review" ? (
            <p className="mt-2 text-sm text-amber-200">
              A regisztrációd jóváhagyásra vár. Értesítünk, amint elkészülünk (1–2 munkanap).
            </p>
          ) : myEmployer.status === "rejected" ? (
            <p className="mt-2 text-sm text-red-300">
              A regisztrációd elutasításra került. Kérdés esetén írj az info@vedettsarok.hu címre.
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-300">Profil státusza: {myEmployer.status}</p>
          )}
        </section>
      ) : (
        <section className="mt-8 rounded-2xl bg-sni-brand-navy p-6 text-white">
          <h2 className="text-lg font-extrabold">Van rugalmas munkád vagy megbízásod?</h2>
          <p className="mt-2 text-sm text-blue-100 leading-relaxed">
            A VédettKarrier olyan partnerekkel dolgozik együtt, akik pontosan, érthetően írják le a munkakörülményeket,
            és nyitottak arra, hogy rugalmas, előre tervezhető lehetőséget kínáljanak.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/vedettmunka/munkaltatok"
              className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Karrierpartner-információk
            </Link>
            <Link
              href="/vedettmunka/munkaltatoi-regisztracio"
              className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-white"
            >
              Karrierpartner leszek
            </Link>
          </div>
        </section>
      )}

    </div>
  );
}
