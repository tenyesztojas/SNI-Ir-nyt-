import Link from "next/link";
import { Briefcase, FileText, Bell, Building2, CheckCircle2, Users, Heart, Eye } from "lucide-react";
import { getPublishedJobs, getMyJobAlert } from "@/lib/vedettmunka/data";
import { createClient } from "@/lib/supabase/server";
import ErtesitoCta from "./ErtesitoCta";

export const metadata = {
  title: "Védett Munka – Befogadó munkahelyek álláskeresőknek",
};

export const dynamic = "force-dynamic";

export default async function VedettMunkaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [recentJobs, myAlert] = await Promise.all([
    getPublishedJobs({}),
    user ? getMyJobAlert() : Promise.resolve(null),
  ]);
  const latestJobs = recentJobs.slice(0, 3);

  // null = guest, true = subscribed+enabled, false = logged in but no/disabled alert
  const alertEnabled: boolean | null = user === null
    ? null
    : myAlert?.enabled === true
    ? true
    : false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue px-8 py-12 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sni-brand-teal/20">
          <Briefcase className="text-sni-brand-teal" size={32} />
        </div>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Védett Munka</h1>
        <p className="mt-3 text-lg text-blue-100">
          Olyan munkahelyek, ahol számít, hogy kiszámítható legyen, érthetők legyenek a feladatok,
          és nem kell diagnózist igazolni a jelentkezéshez.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/vedettmunka/allasok"
            className="rounded-full bg-sni-brand-teal px-7 py-3 font-bold text-sni-brand-navy transition hover:bg-white"
          >
            Állások böngészése
          </Link>
          <Link
            href="/vedettmunka/oneletrajz"
            className="rounded-full border-2 border-white/40 px-7 py-3 font-bold text-white transition hover:bg-white/10"
          >
            Önéletrajz készítése
          </Link>
        </div>
      </div>

      {/* Miben más ez az álláskereső? */}
      <section className="mt-12">
        <h2 className="text-xl font-extrabold text-sni-brand-navy">Miben más a Védett Munka?</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: CheckCircle2, title: "Nincs diagnózis-kötelezettség", text: "A hirdetők vállalják, hogy nem kérnek egészségügyi igazolást a jelentkezés első szakaszában." },
            { icon: Eye, title: "Egyszerű, érthető szöveg", text: 'Nem HR-zsargon, hanem közérthető kérdések: "Mit kell csinálnom?", "Mikor kell dolgoznom?"' },
            { icon: Users, title: "Befogadó munkáltatók", text: "Minden hirdető vállalta, hogy nyitott neurodivergens és megváltozott munkaképességű jelöltekre." },
            { icon: Heart, title: "Szülőknek is", text: "Külön szűrhetsz olyan állásokra, ahol a munkáltató nyitott érintett gyermeket nevelő szülőkre." },
            { icon: Bell, title: "Állásértesítő", text: "Beállítod, mit keresel – e-mailben értesítünk, ha passzol valami." },
            { icon: FileText, title: "CV-készítő", text: "Lépésről lépésre, egyszerű kérdésekkel segítünk elkészíteni az önéletrajzod. Letöltheted PDF-ben." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-gray-100 bg-white p-5">
              <Icon className="mb-3 text-sni-brand-teal" size={24} />
              <p className="font-bold text-sni-brand-navy">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Legújabb állások */}
      {latestJobs.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-sni-brand-navy">Legújabb állások</h2>
            <Link href="/vedettmunka/allasok" className="text-sm font-semibold text-sni-brand-teal hover:underline">
              Összes megtekintése →
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {latestJobs.map((job) => (
              <Link
                key={job.id}
                href={`/vedettmunka/allasok/${job.id}`}
                className="group flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 transition hover:border-sni-brand-teal/40 hover:shadow-sm"
              >
                <div>
                  <p className="font-bold text-sni-brand-navy group-hover:text-sni-brand-teal">{job.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {(job.employers as { company_name: string } | null)?.company_name} · {job.city}
                  </p>
                </div>
                <span className="ml-4 shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  {job.work_type === "szellemi" ? "Szellemi" : "Fizikai"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Állásértesítő CTA */}
      <ErtesitoCta initialEnabled={alertEnabled} />

      {/* Munkáltatóknak */}
      <section className="mt-12 rounded-2xl border border-sni-brand-teal/20 bg-sni-brand-teal/5 p-6">
        <div className="flex items-start gap-4">
          <Building2 className="mt-1 shrink-0 text-sni-brand-teal" size={28} />
          <div>
            <h2 className="text-lg font-extrabold text-sni-brand-navy">Te is hirdetsz állást?</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">
              A Védett Munka olyan munkáltatókkal dolgozik együtt, akik nyitottak neurodivergens,
              megváltozott munkaképességű és érintett szülő jelöltekre.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/vedettmunka/munkaltatok"
                className="rounded-full border border-sni-brand-teal px-5 py-2 text-sm font-semibold text-sni-brand-teal transition hover:bg-sni-brand-teal hover:text-white"
              >
                Munkáltatói információk
              </Link>
              <Link
                href="/vedettmunka/munkaltatoi-regisztracio"
                className="rounded-full bg-sni-brand-navy px-5 py-2 text-sm font-semibold text-white transition hover:bg-sni-brand-blue"
              >
                Regisztrálok munkáltatóként
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
