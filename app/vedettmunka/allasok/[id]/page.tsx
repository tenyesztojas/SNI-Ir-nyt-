import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Clock, Calendar, Phone, MessageSquare, Volume2, GraduationCap, UserCheck, FileText, AlertTriangle } from "lucide-react";
import { getPublishedJobById } from "@/lib/vedettmunka/data";
import JobReportButton from "./JobReportButton";

export const dynamic = "force-dynamic";

function Tag({ children, color = "teal" }: { children: string; color?: "teal" | "blue" | "amber" }) {
  const cls = {
    teal: "bg-sni-brand-teal/10 text-sni-brand-teal",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  }[color];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Block({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 text-sni-brand-navy">
        <Icon size={18} />
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}

const labelMap: Record<string, string> = {
  nem: "Nem",
  ritkan: "Ritkán",
  naponta_nehanykor: "Naponta néhányszor",
  igen_gyakran: "Igen, gyakran",
  igen: "Igen",
  reszben: "Részben",
  csendes: "Csendes, általában nincs zaj",
  beszelgetes: "Emberek beszélgetnek",
  gepek: "Gépek hangja is hallható",
  sok_hang: "Sok hang van egyszerre",
  nagyon_hangos: "Nagyon hangos",
  rugalmasak: "Rugalmasak",
  elore_meghat: "Előre meghatározottak",
  nem_rugalmasak: "Nem rugalmasak",
  rugalmas: "Rugalmas",
  nem_rugalmas: "Nem rugalmas",
  van: "Van kijelölt mentor/betanító",
  nincs: "Nincs kijelölt személy",
  meg_egyeztetes_alatt: "Egyeztetés alatt",
  egyeztetes: "Egyeztetés alapján",
  munkahelyen: "Munkahelyen",
  otthonrol: "Otthonról",
  hibrid: "Hibrid",
};

function L(key: string | null | undefined) {
  if (!key) return "Nem megadott";
  return labelMap[key] ?? key;
}

export default async function AllasAdatlapPage({ params }: { params: { id: string } }) {
  const job = await getPublishedJobById(params.id);
  if (!job) notFound();

  const companyName = (job.employers as { company_name: string } | null)?.company_name ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/vedettmunka/allasok" className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza az álláslistához
      </Link>

      {/* Fejléc */}
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue p-6 text-white">
        <div className="flex flex-wrap gap-2">
          <Tag color={job.work_type === "szellemi" ? "blue" : "amber"}>
            {job.work_type === "szellemi" ? "Szellemi munka" : "Fizikai munka"}
          </Tag>
          <Tag color="teal">{L(job.work_location_type)}</Tag>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">{job.title}</h1>
        <p className="mt-1 text-blue-200">{companyName}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-100">
          <span className="flex items-center gap-1"><MapPin size={14} />{job.city}{job.county ? `, ${job.county}` : ""}</span>
          {job.daily_hours && <span className="flex items-center gap-1"><Clock size={14} />{job.daily_hours}</span>}
          {job.application_deadline && (
            <span className="flex items-center gap-1">
              <Calendar size={14} />Határidő: {new Date(job.application_deadline).toLocaleDateString("hu-HU")}
            </span>
          )}
        </div>
        {job.salary_range && (
          <p className="mt-3 text-lg font-bold text-sni-brand-teal">💰 {job.salary_range}</p>
        )}
      </div>

      {/* Gyors jelölők */}
      <div className="mt-4 flex flex-wrap gap-2">
        {job.open_to_neurodivergent && <Tag>Neurodivergens jelölőknek is</Tag>}
        {job.open_to_disabled && <Tag>Megváltozott munkaképességűeknek is</Tag>}
        {job.open_to_parents && <Tag>Szülőknek is alkalmas</Tag>}
        {job.part_time_available === "igen" && <Tag>Részmunkaidő</Tag>}
        {job.mentor_available === "van" && <Tag>Mentor van</Tag>}
        {job.start_end_flexibility === "rugalmas" && <Tag>Rugalmas munkaidő</Tag>}
        {job.written_instructions_available === "igen" && <Tag>Írásos feladatok</Tag>}
        {(job.verbal_interaction_level === "nem" || job.verbal_interaction_level === "ritkan") && <Tag>Kevés szóbeli kommunikáció</Tag>}
        {job.noise_level === "csendes" && <Tag>Csendesebb munkakörnyezet</Tag>}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {/* Mit kell csinálnom? */}
        {job.tasks_description && (
          <Block icon={FileText} title="Mit kell csinálnom?">
            <p className="whitespace-pre-wrap">{job.tasks_description}</p>
          </Block>
        )}

        {/* Mit kell tudnom? */}
        {job.requirements_description && (
          <Block icon={GraduationCap} title="Mit kell tudnom? (elvárások)">
            <p className="whitespace-pre-wrap">{job.requirements_description}</p>
          </Block>
        )}

        {/* Hol fogok dolgozni? */}
        <Block icon={MapPin} title="Hol fogok dolgozni?">
          <p>{L(job.work_location_type)}</p>
          {job.workplace_address && <p className="mt-1 text-gray-500">{job.workplace_address}</p>}
        </Block>

        {/* Mikor kell dolgoznom? */}
        <Block icon={Clock} title="Mikor kell dolgoznom?">
          {job.daily_hours && <p><strong>Napi munkaidő:</strong> {job.daily_hours}</p>}
          {job.working_days && <p className="mt-1"><strong>Munkanapok:</strong> {job.working_days}</p>}
          {job.working_hours_from && job.working_hours_to && (
            <p className="mt-1"><strong>Munkaidő:</strong> {job.working_hours_from} – {job.working_hours_to}</p>
          )}
          {job.break_description && <p className="mt-1"><strong>Szünet:</strong> {job.break_description}</p>}
          <p className="mt-1"><strong>Munkarend:</strong> {L(job.schedule_type)}</p>
          <p className="mt-1"><strong>Rugalmas kezdés/befejezés:</strong> {L(job.start_end_flexibility)}</p>
          <p className="mt-1"><strong>Rugalmas szünetek:</strong> {L(job.break_flexibility)}</p>
          <p className="mt-1"><strong>Részmunkaidő lehetséges:</strong> {L(job.part_time_available)}</p>
        </Block>

        {/* Miben kapok segítséget? */}
        <Block icon={UserCheck} title="Miben kapok segítséget? (munkáltatói vállalás)">
          <p className="whitespace-pre-wrap">{job.support_description || "Nem megadott"}</p>
        </Block>

        {/* Milyen a munkahely hangkörnyezete? */}
        <Block icon={Volume2} title="Milyen ez a munkahely?">
          <div className="grid gap-2 sm:grid-cols-2">
            <p><strong>Hangkörnyezet:</strong> {L(job.noise_level)}</p>
            <p><strong>Kell telefonálni?</strong> {L(job.phone_required_level)}</p>
            <p><strong>Szóbeli kommunikáció:</strong> {L(job.verbal_interaction_level)}</p>
            <p><strong>Feladatok írásban is:</strong> {L(job.written_instructions_available)}</p>
            <p><strong>Mentor:</strong> {L(job.mentor_available)}</p>
          </div>
          {job.interaction_with?.length > 0 && (
            <p className="mt-2"><strong>Kommunikáció:</strong> {job.interaction_with.join(", ")}</p>
          )}
        </Block>

        {/* Hogyan tanítják meg a munkát? */}
        {job.training_description && (
          <Block icon={GraduationCap} title="Hogyan tanítják meg a munkát?">
            <p className="whitespace-pre-wrap">{job.training_description}</p>
          </Block>
        )}

        {/* Hogyan zajlik az interjú? */}
        {job.interview_process && (
          <Block icon={MessageSquare} title="Hogyan zajlik az állásinterjú?">
            <p className="whitespace-pre-wrap">{job.interview_process}</p>
          </Block>
        )}

        {/* Kapcsolattartó */}
        {job.contact_name && (
          <Block icon={Phone} title="Kitől kérdezhetek, ha segítségre van szükségem?">
            <p>{job.contact_name}</p>
            {job.contact_email && <p className="mt-0.5 text-sni-brand-blue">{job.contact_email}</p>}
          </Block>
        )}

        {/* Mikor kezdhetek? */}
        {job.expected_start_date && (
          <Block icon={Calendar} title="Mikor kell elkezdenem dolgozni?">
            <p>{job.expected_start_date}</p>
          </Block>
        )}
      </div>

      {/* Adatkezelési figyelmeztetés */}
      <div className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Fontos:</strong> Ez a munkáltató vállalta, hogy a Védett Munka felületen neurodivergens, megváltozott munkaképességű és érintett szülő jelölők is jelentkezhetnek, és a kiválasztási folyamat első szakaszában nem kér egészségügyi dokumentumot, diagnózist vagy fogyatékossági igazolást.
      </div>

      {/* Gombok */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/vedettmunka/jelentkezes/${job.id}`}
          className="rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
        >
          Jelentkezem
        </Link>
        <JobReportButton jobId={job.id} />
      </div>
    </div>
  );
}
