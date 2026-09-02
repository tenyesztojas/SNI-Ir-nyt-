import Link from "next/link";
import { getPublishedJobs, getMyJobAlert, getMyEmployer } from "@/lib/vedettmunka/data";
import { createClient } from "@/lib/supabase/server";
import ErtesitoCta from "./ErtesitoCta";
import VmIcon from "@/components/vedettmunka/VmIcon";

export const metadata = {
  title: "Védett Munka – Tudd előre, mire számíthatsz a munkahelyen",
};

export const dynamic = "force-dynamic";

// 6 kártya: "Mit tudhatsz meg?"
const WHAT_YOU_LEARN = [
  { icon: "predictable_tasks",   title: "Mit kell csinálnom?",          desc: "Pontosan leírják, mik lesznek a feladataid." },
  { icon: "predictable_schedule",title: "Mikor kell dolgoznom?",         desc: "Megtudhatod, milyen a munkarend és a beosztás." },
  { icon: "fixed_location",      title: "Hol fogok dolgozni?",           desc: "Megmutatják a munkavégzés helyét és körülményeit." },
  { icon: "quieter_env",         title: "Milyen a munkakörnyezet?",      desc: "Megismerheted a zajszintet, a csapat méretét és a légkört." },
  { icon: "assigned_mentor",     title: "Kitől kérhetek segítséget?",    desc: "Megtudod, van-e kijelölt betanító vagy kapcsolattartó." },
  { icon: "gradual_training",    title: "Mi történik a jelentkezés után?", desc: "Előre láthatod, hogyan néz ki a kiválasztás folyamata." },
] as const;

// Piktogram preview az álláskártyákon
const PREVIEW_ATTRS: { slug: string; label: string }[] = [
  { slug: "gradual_training",    label: "Fokozatos betanítás" },
  { slug: "predictable_schedule",label: "Kiszámítható munkarend" },
  { slug: "quieter_env",         label: "Csendesebb környezet" },
  { slug: "small_team",          label: "Kis csapat" },
  { slug: "part_time",           label: "Részmunkaidő" },
  { slug: "home_office",         label: "Home office" },
];

export default async function VedettMunkaPage() {
  const supabase = createClient();
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
          VédettMunka
        </p>
        <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
          Tudd előre,<br />mire számíthatsz a munkahelyen.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-blue-100 leading-relaxed">
          Itt nemcsak azt látod, milyen munkát kínál egy cég.<br />
          Azt is megmutatjuk, <strong className="text-white">milyen ott dolgozni.</strong>
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/vedettmunka/allasok"
            className="rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-white hover:shadow-lg"
          >
            Munkát keresek
          </Link>
          <Link
            href="/vedettmunka/munkaltatok"
            className="rounded-full border-2 border-white/40 px-8 py-3 font-bold text-white transition hover:bg-white/10"
          >
            Munkáltató vagyok
          </Link>
        </div>
      </div>

      {/* ── "MIT TUDHATSZ MEG?" ──────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-center text-xl font-extrabold text-sni-brand-navy">
          Mit tudhatsz meg egy állásról?
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Minden hirdetésnél megtalálod ezeket az információkat.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WHAT_YOU_LEARN.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="flex flex-col items-start rounded-2xl border border-gray-100 bg-white p-4 shadow-soft"
            >
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-sni-brand-teal/10 text-sni-brand-teal">
                <VmIcon name={icon} size={20} />
              </div>
              <p className="text-sm font-bold text-sni-brand-navy leading-snug">{title}</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PIKTOGRAM RENDSZER PREVIEW ───────────────────────── */}
      <section className="mt-12 rounded-2xl border border-sni-brand-teal/20 bg-gradient-to-r from-sni-brand-teal/5 to-blue-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-sni-brand-blue mb-3">
          Az állások piktogramjai megmutatják
        </p>
        <div className="flex flex-wrap gap-2">
          {PREVIEW_ATTRS.map(({ slug, label }) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1.5 rounded-full border border-sni-brand-teal/30 bg-white px-3 py-1.5 text-xs font-semibold text-sni-brand-navy shadow-sm"
            >
              <VmIcon name={slug} size={13} className="text-sni-brand-teal" />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center px-3 py-1.5 text-xs text-gray-400">
            …és még sok más
          </span>
        </div>
      </section>

      {/* ── LEGÚJABB ÁLLÁSOK ─────────────────────────────────── */}
      {latestJobs.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-sni-brand-navy">Legújabb állások</h2>
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

      {/* ── ÁLLÁSÉRTESÍTŐ ────────────────────────────────────── */}
      <ErtesitoCta initialEnabled={alertEnabled} />

      {/* ── ÖNÉLETRAJZ ──────────────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft flex items-start gap-4">
        <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-sni-brand-navy/10 text-sni-brand-navy">
          <VmIcon name="written_tasks" size={22} />
        </div>
        <div>
          <h3 className="font-bold text-sni-brand-navy">Segítünk önéletrajzot írni</h3>
          <p className="mt-1 text-sm text-gray-600">
            Lépésről lépésre, egyszerű kérdésekkel. PDF-ben le is töltheted.
          </p>
          <Link
            href="/vedettmunka/oneletrajz"
            className="mt-3 inline-block rounded-full border border-sni-brand-navy px-5 py-2 text-sm font-semibold text-sni-brand-navy transition hover:bg-sni-brand-navy hover:text-white"
          >
            CV készítése
          </Link>
        </div>
      </section>

      {/* ── MUNKAPROFIL ─────────────────────────────────────── */}
      <section className="mt-4 rounded-2xl border border-sni-brand-teal/20 bg-sni-brand-teal/5 p-6 flex items-start gap-4">
        <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-sni-brand-teal/20 text-sni-brand-teal">
          <VmIcon name="predictable_tasks" size={22} />
        </div>
        <div>
          <h3 className="font-bold text-sni-brand-navy">Saját Munkaprofil</h3>
          <p className="mt-1 text-sm text-gray-600">
            Jelöld meg, mi fontos neked a munkahelyen – és megmutatjuk, melyik állásnál mit találsz meg.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Nem kérdezünk diagnózist. Csak azt, milyen körülmények közt tudsz jól dolgozni.
          </p>
          <Link
            href={user ? "/vedettmunka/munkaprofil" : "/belepes"}
            className="mt-3 inline-block rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
          >
            {user ? "Profilom szerkesztése" : "Belépés a profilhoz"}
          </Link>
        </div>
      </section>

      {/* ── MUNKÁLTATÓKNAK / MUNKÁLTATÓI PROFIL ─────────────── */}
      {myEmployer ? (
        <section className="mt-8 rounded-2xl bg-sni-brand-navy p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-sni-brand-teal mb-1">Munkáltatói fiók</p>
          <h2 className="text-lg font-extrabold">{myEmployer.company_name}</h2>
          {myEmployer.status === "approved" ? (
            <>
              <p className="mt-1 text-sm text-blue-100">A profilod jóváhagyva. Feladhatsz új állásokat.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/vedettmunka/hirdetes-feladas"
                  className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-white"
                >
                  + Új hirdetés feladása
                </Link>
                <Link
                  href="/admin/vedettmunka/hirdetesek"
                  className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Hirdetéseim
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
        <h2 className="text-lg font-extrabold">Te is hirdetsz állást?</h2>
        <p className="mt-2 text-sm text-blue-100 leading-relaxed">
          A VédettMunka olyan munkáltatókkal dolgozik együtt, akik pontosan, érthetően írják le a munkakörülményeket —
          és nyitottak különböző munkavégzési igényű jelöltekre.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/vedettmunka/munkaltatok"
            className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Munkáltatói információk
          </Link>
          <Link
            href="/vedettmunka/munkaltatoi-regisztracio"
            className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy transition hover:bg-white"
          >
            Regisztrálok
          </Link>
        </div>
      </section>
      )}

    </div>
  );
}
