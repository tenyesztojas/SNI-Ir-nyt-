import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Clock, Calendar, ArrowRight, AlertTriangle } from "lucide-react";
import { getPublishedJobById, getJobAttributes } from "@/lib/vedettmunka/data";
import { ATTRIBUTE_LABELS, deriveAttributesFromJobPost } from "@/lib/vedettmunka/attributes";
import VmAttributeChip from "@/components/vedettmunka/VmAttributeChip";
import VmIcon from "@/components/vedettmunka/VmIcon";
import JobReportButton from "./JobReportButton";

export const dynamic = "force-dynamic";

// ─── Helper: section blokk ────────────────────────────────────
function Section({
  icon,
  title,
  children,
  accent = false,
}: {
  icon: string;
  title: string;
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
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sni-brand-navy/8 text-sni-brand-navy">
          <VmIcon name={icon} size={24} />
        </div>
        <h2 className="font-bold text-sni-brand-navy">{title}</h2>
      </div>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

// ─── Label map (meglévő enum értékekhez) ─────────────────────
const L: Record<string, string> = {
  nem: "Nem", ritkan: "Ritkán", naponta_nehanykor: "Naponta néhányszor",
  igen_gyakran: "Igen, gyakran", igen: "Igen", reszben: "Részben",
  csendes: "Csendes", beszelgetes: "Emberek beszélgetnek",
  gepek: "Gépek hangja is hallható", sok_hang: "Sok hang van",
  nagyon_hangos: "Nagyon hangos",
  rugalmasak: "Rugalmasak", elore_meghat: "Előre meghatározottak",
  nem_rugalmasak: "Nem rugalmasak", rugalmas: "Rugalmas",
  nem_rugalmas: "Nem rugalmas", egyeztetes: "Egyeztetés alapján",
  van: "Van kijelölt mentor/betanító", nincs: "Nincs kijelölt személy",
  meg_egyeztetes_alatt: "Egyeztetés alatt",
  munkahelyen: "Munkahelyen", otthonrol: "Otthonról", hibrid: "Hibrid",
};
function label(key: string | null | undefined) {
  return key ? (L[key] ?? key) : null;
}

// ─── Kiválasztási folyamat timeline ──────────────────────────
const SELECTION_STEPS: { key: string; label: string; icon: string }[] = [
  { key: "cv",            label: "Önéletrajz átnézése",   icon: "written_tasks"      },
  { key: "phone",         label: "Telefonos egyeztetés",  icon: "can_ask_questions"  },
  { key: "online",        label: "Online interjú",        icon: "computer_work"      },
  { key: "personal",      label: "Személyes interjú",     icon: "assigned_mentor"    },
  { key: "trial",         label: "Próbanap",              icon: "gradual_training"   },
  { key: "practical",     label: "Gyakorlati feladat",    icon: "varied_tasks"       },
  { key: "second_interview", label: "Második interjú",   icon: "regular_feedback"   },
  { key: "decision",      label: "Döntés",               icon: "predictable_tasks"  },
];

export default async function AllasAdatlapPage({ params }: { params: { id: string } }) {
  const job = await getPublishedJobById(params.id);
  if (!job) notFound();

  const employer = job.employers as { company_name: string; website?: string | null } | null;
  const companyName = employer?.company_name ?? "";

  // Piktogramok: DB + legacy levezetés
  const attrSlugs = await getJobAttributes(params.id, job);
  const legacySlugs = attrSlugs.length === 0 ? deriveAttributesFromJobPost(job) : attrSlugs;
  const displaySlugs = [...new Set([...attrSlugs, ...legacySlugs])];

  // Kiválasztási lépések parse-olása
  const process = job.interview_process ?? "";
  const selectionSteps = SELECTION_STEPS.filter((s) =>
    process.toLowerCase().includes(s.key) ||
    (s.key === "cv" && process.length > 0)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/vedettmunka/allasok" className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza az álláslistához
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
            <span className="flex items-center gap-1.5"><Calendar size={14} /> Határidő: {job.application_deadline}</span>
          )}
          {job.salary_range && job.salary_range !== "" && (
            <span className="font-bold text-sni-brand-teal">{job.salary_range}</span>
          )}
        </div>

        {/* Top piktogramok */}
        {displaySlugs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {displaySlugs.slice(0, 6).map((slug) => (
              <span
                key={slug}
                className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white"
              >
                <VmIcon name={slug} size={20} />
                {ATTRIBUTE_LABELS[slug]?.title ?? slug}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5">
          <Link
            href={`/vedettmunka/jelentkezes/${job.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy transition hover:bg-white"
          >
            Jelentkezem <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">

        {/* ── 2. MIT FOGSZ CSINÁLNI? ──────────────────────── */}
        {job.tasks_description && (
          <Section icon="predictable_tasks" title="Mit fogsz csinálni?">
            <p className="whitespace-pre-line">{job.tasks_description}</p>
          </Section>
        )}

        {/* ── 3. MIKOR DOLGOZOL? ──────────────────────────── */}
        <Section icon="predictable_schedule" title="Mikor dolgozol?">
          <div className="space-y-1.5">
            {job.daily_hours && <p><span className="font-semibold">Napi munkaidő:</span> {job.daily_hours}</p>}
            {job.working_days && <p><span className="font-semibold">Munkaszervezés:</span> {job.working_days}</p>}
            {(job.working_hours_from || job.working_hours_to) && (
              <p><span className="font-semibold">Munkaidő:</span> {job.working_hours_from} – {job.working_hours_to}</p>
            )}
            {job.schedule_type && <p><span className="font-semibold">Munkarend típusa:</span> {label(job.schedule_type)}</p>}
            {job.part_time_available && <p><span className="font-semibold">Részmunkaidő:</span> {label(job.part_time_available)}</p>}
            {job.start_end_flexibility && <p><span className="font-semibold">Érkezési/távozási rugalmasság:</span> {label(job.start_end_flexibility)}</p>}
            {job.break_description && <p><span className="font-semibold">Szünet:</span> {job.break_description}</p>}
          </div>
        </Section>

        {/* ── 4. HOL DOLGOZOL? ────────────────────────────── */}
        <Section icon="fixed_location" title="Hol fogsz dolgozni?">
          <div className="space-y-1.5">
            {job.work_location_type && <p><span className="font-semibold">Helyszín:</span> {label(job.work_location_type)}</p>}
            {job.workplace_address && <p><span className="font-semibold">Cím:</span> {job.workplace_address}</p>}
            {(job.city || job.county) && <p><span className="font-semibold">Település:</span> {job.city}{job.county ? `, ${job.county}` : ""}</p>}
          </div>
        </Section>

        {/* ── 5. MIRE SZÁMÍTHATSZ A MUNKAHELYEN? (PIKTOGRAMOK) ── */}
        {displaySlugs.length > 0 && (
          <Section icon="calmer_env" title="Mire számíthatsz a munkahelyen?" accent>
            <p className="mb-4 text-xs text-gray-500">
              A munkáltató megjelölte, hogy az alábbiak jellemzők ennél az állásnál.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {displaySlugs.map((slug) => (
                <VmAttributeChip key={slug} slug={slug} showDesc size="md" />
              ))}
            </div>
            {displaySlugs.length === 0 && (
              <p className="text-xs text-gray-400 italic">A munkáltató még nem töltötte ki ezt a részt.</p>
            )}
          </Section>
        )}

        {/* ── 6. HOGYAN TÖRTÉNIK A BETANÍTÁS? ─────────────── */}
        {job.training_description && (
          <Section icon="gradual_training" title="Hogyan történik a betanítás?">
            <p className="whitespace-pre-line">{job.training_description}</p>
            {job.mentor_available && (
              <p className="mt-2"><span className="font-semibold">Kijelölt mentor:</span> {label(job.mentor_available)}</p>
            )}
            {job.written_instructions_available && (
              <p><span className="font-semibold">Írásos feladatok:</span> {label(job.written_instructions_available)}</p>
            )}
          </Section>
        )}

        {/* ── 7. KITŐL KÉRHETSZ SEGÍTSÉGET? ───────────────── */}
        {job.support_description && (
          <Section icon="assigned_mentor" title="Kitől kérhetsz segítséget?">
            <p className="whitespace-pre-line">{job.support_description}</p>
          </Section>
        )}

        {/* ── 8. HOGYAN JELENTKEZHETSZ? ────────────────────── */}
        <Section icon="written_tasks" title="Hogyan jelentkezhetsz?">
          <div className="space-y-1.5">
            {job.required_documents && (
              <p><span className="font-semibold">Szükséges dokumentumok:</span> {job.required_documents}</p>
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
              <p><span className="font-semibold">Határidő:</span> {job.application_deadline}</p>
            )}
            {job.expected_start_date && (
              <p><span className="font-semibold">Várható kezdés:</span> {job.expected_start_date}</p>
            )}
          </div>
          <div className="mt-4">
            <Link
              href={`/vedettmunka/jelentkezes/${job.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-sni-brand-teal px-6 py-2.5 text-sm font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
            >
              Jelentkezem <ArrowRight size={15} />
            </Link>
          </div>
        </Section>

        {/* ── 9. MI TÖRTÉNIK A JELENTKEZÉS UTÁN? ───────────── */}
        {(job.interview_process || selectionSteps.length > 0) && (
          <Section icon="regular_feedback" title="Mi történik a jelentkezés után?">
            {selectionSteps.length > 1 ? (
              <div className="flex flex-col gap-0">
                {selectionSteps.map((step, i) => (
                  <div key={step.key} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sni-brand-teal/15 text-sni-brand-teal">
                        <VmIcon name={step.icon} size={22} />
                      </div>
                      {i < selectionSteps.length - 1 && (
                        <div className="w-0.5 flex-1 bg-gray-100 my-1" style={{ minHeight: 16 }} />
                      )}
                    </div>
                    <p className="pt-1.5 text-sm font-semibold text-gray-700">{step.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-line">{job.interview_process}</p>
            )}
          </Section>
        )}

        {/* Elvárások */}
        {job.requirements_description && (
          <Section icon="varied_tasks" title="Amit elvárnak tőled">
            <p className="whitespace-pre-line">{job.requirements_description}</p>
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Ez a munkáltató vállalta, hogy <strong>nem kér egészségügyi igazolást</strong> a jelentkezés első szakaszában.</span>
            </div>
          </Section>
        )}

        {/* Munkáltató info */}
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
