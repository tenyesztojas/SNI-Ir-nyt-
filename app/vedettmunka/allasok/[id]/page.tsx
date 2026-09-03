import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Clock, Calendar, ArrowRight, AlertTriangle } from "lucide-react";
import { getPublishedJobById, getJobAttributes } from "@/lib/vedettmunka/data";
import { ATTRIBUTE_LABELS, deriveAttributesFromJobPost } from "@/lib/vedettmunka/attributes";
import JobReportButton from "./JobReportButton";

export const dynamic = "force-dynamic";

// ─── Helper: easy language szekció ────────────────────────────
function Section({
  title,
  subtitle,
  children,
  accent = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-sni-brand-teal/20 bg-sni-brand-teal/5"
          : "border-gray-100 bg-white"
      }`}
    >
      <h2 className="font-bold text-sni-brand-navy text-base">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-xs text-gray-400 leading-snug">{subtitle}</p>
      )}
      <div className="mt-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

const L: Record<string, string> = {
  nem: "Nem", ritkan: "Ritkán", naponta_nehanykor: "Naponta néhányszor",
  igen_gyakran: "Igen, gyakran", igen: "Igen", reszben: "Részben",
  csendes: "Csendes", beszelgetes: "Emberek beszélgetnek",
  gepek: "Gépek hangja is hallható", sok_hang: "Sok hang van",
  nagyon_hangos: "Nagyon hangos",
  rugalmasak: "Rugalmasak", elore_meghat: "Előre meghatározottak",
  nem_rugalmasak: "Nem rugalmasak", rugalmas: "Rugalmas",
  nem_rugalmas: "Nem rugalmas", egyeztetes: "Egyeztetés alapján",
  van: "Van kijelölt betanító/kapcsolattartó", nincs: "Nincs kijelölt személy",
  meg_egyeztetes_alatt: "Egyeztetés alatt",
  munkahelyen: "Helyszínen", otthonrol: "Otthonról", hibrid: "Helyszín + otthon",
};
function label(key: string | null | undefined) {
  return key ? (L[key] ?? key) : null;
}

// ─── Rákérdezős kérdéslista ──────────────────────────────────
const QUESTIONS = [
  "Pontosan mely napokon kell dolgozni?",
  "Előre megkapom-e a beosztást?",
  "Mi történik, ha családi ok miatt módosítani kell?",
  "Kihez fordulhatok kérdéssel?",
  "Megkapom-e írásban a feladatokat?",
  "Van-e betanítás az elején?",
  "Hány ember dolgozik egy helyen?",
  "Kell-e telefonon ügyfélkapcsolatot kezelni?",
];

export default async function AllasAdatlapPage({ params }: { params: { id: string } }) {
  const job = await getPublishedJobById(params.id);
  if (!job) notFound();

  const employer = job.employers as { company_name: string; website?: string | null } | null;
  const companyName = employer?.company_name ?? "";

  const attrSlugs = await getJobAttributes(params.id, job);
  const legacySlugs = attrSlugs.length === 0 ? deriveAttributesFromJobPost(job) : attrSlugs;
  const displaySlugs = [...new Set([...attrSlugs, ...legacySlugs])];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/vedettmunka/allasok" className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza a lehetőségekhez
      </Link>

      {/* ── 1. FEJLÉC ──────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue p-6 text-white">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-0.5 font-semibold ${
            job.work_type === "szellemi" ? "bg-blue-400/30 text-blue-100" : "bg-amber-400/30 text-amber-100"
          }`}>
            {job.work_type === "szellemi" ? "Szellemi munka" : "Fizikai munka"}
          </span>
          {job.work_location_type && (
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-medium">
              {label(job.work_location_type)}
            </span>
          )}
          {job.job_category && (
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-medium">{job.job_category}</span>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-extrabold leading-snug sm:text-3xl">{job.title}</h1>
        <p className="mt-1 text-blue-200 font-semibold">{companyName}</p>

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-100">
          {(job.city || job.county) && (
            <span className="flex items-center gap-1.5"><MapPin size={14} /> {job.city}{job.county ? `, ${job.county}` : ""}</span>
          )}
          {job.daily_hours && (
            <span className="flex items-center gap-1.5"><Clock size={14} /> {job.daily_hours}</span>
          )}
          {job.application_deadline && (
            <span className="flex items-center gap-1.5"><Calendar size={14} /> Érdeklődési határidő: {job.application_deadline}</span>
          )}
          {job.salary_range && job.salary_range !== "" && (
            <span className="font-bold text-sni-brand-teal">{job.salary_range}</span>
          )}
        </div>

        {/* Jellemzők — szöveges badge, ikon nélkül */}
        {displaySlugs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {displaySlugs.slice(0, 6).map((slug) => (
              <span
                key={slug}
                className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white"
              >
                {ATTRIBUTE_LABELS[slug]?.title ?? slug}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/vedettmunka/jelentkezes/${job.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy transition hover:bg-white"
          >
            Jelentkezem <ArrowRight size={16} />
          </Link>
          <Link
            href={`/vedettmunka/jelentkezes/${job.id}?tipus=erdeklodes`}
            className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Érdeklődöm
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">

        {/* ── 2. MIT KELL CSINÁLNI? ───────────────────────── */}
        {job.tasks_description && (
          <Section title="Mit kell csinálni?" subtitle="Egyszerűen leírják, milyen feladatok lesznek.">
            <p className="whitespace-pre-line">{job.tasks_description}</p>
          </Section>
        )}

        {/* ── 3. MIKOR KELL DOLGOZNI? ─────────────────────── */}
        <Section title="Mikor kell dolgozni?" subtitle="Megtudhatod, milyen a munkarend és a beosztás.">
          <div className="space-y-1.5">
            {job.daily_hours && <p><span className="font-semibold">Napi munkaidő:</span> {job.daily_hours}</p>}
            {job.working_days && <p><span className="font-semibold">Munkaszervezés:</span> {job.working_days}</p>}
            {(job.working_hours_from || job.working_hours_to) && (
              <p><span className="font-semibold">Munkaidő:</span> {job.working_hours_from} – {job.working_hours_to}</p>
            )}
            {job.schedule_type && <p><span className="font-semibold">Munkarend:</span> {label(job.schedule_type)}</p>}
            {job.part_time_available && <p><span className="font-semibold">Részmunkaidő:</span> {label(job.part_time_available)}</p>}
            {job.start_end_flexibility && <p><span className="font-semibold">Rugalmas kezdés/végzés:</span> {label(job.start_end_flexibility)}</p>}
            {job.break_description && <p><span className="font-semibold">Szünet:</span> {job.break_description}</p>}
          </div>
        </Section>

        {/* ── 4. HOL LEHET DOLGOZNI? ──────────────────────── */}
        <Section title="Hol lehet dolgozni?" subtitle="Megmutatják a munkavégzés helyét és körülményeit.">
          <div className="space-y-1.5">
            {job.work_location_type && <p><span className="font-semibold">Helyszín:</span> {label(job.work_location_type)}</p>}
            {job.workplace_address && <p><span className="font-semibold">Cím:</span> {job.workplace_address}</p>}
            {(job.city || job.county) && <p><span className="font-semibold">Település:</span> {job.city}{job.county ? `, ${job.county}` : ""}</p>}
          </div>
        </Section>

        {/* ── 5. MILYEN A MUNKAKÖRNYEZET? (szöveges) ──────── */}
        {displaySlugs.length > 0 && (
          <Section title="Milyen a munkakörnyezet?" subtitle="A hirdető partner megjelölte, mire számíthatsz." accent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {displaySlugs.map((slug) => {
                const info = ATTRIBUTE_LABELS[slug];
                if (!info) return null;
                return (
                  <div key={slug} className="rounded-xl border border-sni-brand-teal/20 bg-white p-3">
                    <p className="font-semibold text-sni-brand-navy text-sm">{info.title}</p>
                    {info.desc && <p className="mt-0.5 text-xs text-gray-500 leading-snug">{info.desc}</p>}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── 6. MIBEN SEGÍTENEK AZ ELEJÉN? ───────────────── */}
        {job.training_description && (
          <Section title="Miben segítenek az elején?" subtitle="Van-e betanítás, kijelölt kapcsolattartó, írásos feladatleírás.">
            <p className="whitespace-pre-line">{job.training_description}</p>
            {job.mentor_available && (
              <p className="mt-2"><span className="font-semibold">Kijelölt kapcsolattartó:</span> {label(job.mentor_available)}</p>
            )}
            {job.written_instructions_available && (
              <p><span className="font-semibold">Írásos feladatleírás:</span> {label(job.written_instructions_available)}</p>
            )}
          </Section>
        )}

        {/* ── 7. KITŐL KÉRHETSZ SEGÍTSÉGET? ───────────────── */}
        {job.support_description && (
          <Section title="Kitől kérhetsz segítséget?">
            <p className="whitespace-pre-line">{job.support_description}</p>
          </Section>
        )}

        {/* ── 8. HOGYAN LEHET JELENTKEZNI? ─────────────────── */}
        <Section title="Hogyan lehet jelentkezni?">
          <div className="space-y-1.5">
            {job.required_documents && (
              <p><span className="font-semibold">Kért dokumentumok:</span> {job.required_documents}</p>
            )}
            {job.application_email && (
              <p>
                <span className="font-semibold">E-mail:</span>{" "}
                <a href={`mailto:${job.application_email}`} className="text-sni-brand-blue underline">
                  {job.application_email}
                </a>
              </p>
            )}
            {job.application_deadline && (
              <p><span className="font-semibold">Érdeklődési határidő:</span> {job.application_deadline}</p>
            )}
            {job.expected_start_date && (
              <p><span className="font-semibold">Várható kezdés:</span> {job.expected_start_date}</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/vedettmunka/jelentkezes/${job.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
            >
              Jelentkezem <ArrowRight size={15} />
            </Link>
            <Link
              href={`/vedettmunka/jelentkezes/${job.id}?tipus=erdeklodes`}
              className="inline-flex items-center gap-2 rounded-full border border-sni-brand-navy px-6 py-2.5 text-sm font-semibold text-sni-brand-navy transition hover:bg-sni-brand-navy hover:text-white"
            >
              Érdeklődöm
            </Link>
          </div>
        </Section>

        {/* ── 9. MI TÖRTÉNIK EZUTÁN? ────────────────────────── */}
        {job.interview_process && (
          <Section title="Mi történik ezután?" subtitle="Előre láthatod, hogyan néz ki a kiválasztás folyamata.">
            <p className="whitespace-pre-line">{job.interview_process}</p>
          </Section>
        )}

        {/* ── 10. MIRE ÉRDEMES RÁKÉRDEZNI? ─────────────────── */}
        <Section title="Mire érdemes rákérdezni?" subtitle="Ezeket a kérdéseket felteheted a partnernek.">
          <ul className="space-y-1.5">
            {QUESTIONS.map((q) => (
              <li key={q} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-sni-brand-teal">›</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Elvárások */}
        {job.requirements_description && (
          <Section title="Mit érdemes tudni hozzá?">
            <p className="whitespace-pre-line">{job.requirements_description}</p>
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Ez a partner vállalta, hogy <strong>nem kér egészségügyi igazolást</strong> a jelentkezés első szakaszában.</span>
            </div>
          </Section>
        )}

        {/* Partner info */}
        {employer?.website && (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm">
            <p className="font-bold text-sni-brand-navy mb-1">{companyName}</p>
            <a href={employer.website} target="_blank" rel="noopener noreferrer"
               className="text-sni-brand-blue hover:underline break-all">{employer.website}</a>
          </div>
        )}

        {/* Bejelentés */}
        <div className="flex justify-end">
          <JobReportButton jobId={job.id} />
        </div>
      </div>
    </div>
  );
}
