import Link from "next/link";
import { Briefcase, MapPin, Clock, Home, Blend, Building2 } from "lucide-react";
import { getPublishedJobs } from "@/lib/vedettmunka/data";
import type { JobPost } from "@/lib/vedettmunka/types";
import AllasokFilterClient from "./AllasokFilterClient";

export const metadata = { title: "Állások" };
export const dynamic = "force-dynamic";

function jobTags(job: JobPost): string[] {
  const tags: string[] = [];
  if (job.part_time_available === "igen") tags.push("Részmunkaidő");
  if (job.mentor_available === "van") tags.push("Támogató személy van");
  if (job.start_end_flexibility === "rugalmas") tags.push("Rugalmas munkaidő");
  if (job.noise_level === "csendes") tags.push("Csendesebb munkakörnyezet");
  if (job.verbal_interaction_level === "nem" || job.verbal_interaction_level === "ritkan") tags.push("Kevés beszélgetés emberekkel");
  if (job.open_to_neurodivergent) tags.push("Neurodivergens jelölteknek is");
  if (job.open_to_disabled) tags.push("Megváltozott munkaképességű személyeknek is");
  if (job.open_to_parents) tags.push("Szülőknek is alkalmas");
  if (job.written_instructions_available === "igen") tags.push("Írásban is kaphatók a feladatok");
  return tags.slice(0, 5);
}

export default async function AllasokPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const filters = {
    work_type: searchParams.work_type || undefined,
    category: searchParams.category || undefined,
    city: searchParams.city || undefined,
    county: searchParams.county || undefined,
    work_location_type: searchParams.location || undefined,
    part_time: searchParams.part_time === "1",
    open_to_neurodivergent: searchParams.nd === "1",
    open_to_disabled: searchParams.disabled === "1",
    open_to_parents: searchParams.parents === "1",
    mentor: searchParams.mentor === "1",
    written_instructions: searchParams.written === "1",
    quiet_environment: searchParams.quiet === "1",
    low_verbal: searchParams.low_verbal === "1",
    q: searchParams.q || undefined,
  };

  const jobs = await getPublishedJobs(filters);

  const locationIcon = {
    munkahelyen: <Building2 size={14} />,
    otthonrol: <Home size={14} />,
    hibrid: <Blend size={14} />,
  };
  const locationLabel = {
    munkahelyen: "Munkahelyen",
    otthonrol: "Otthonról",
    hibrid: "Otthon és munkahelyen is",
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Állások keresése</h1>
      <p className="mt-1 text-sm text-gray-500">
        {jobs.length} hirdetés – befogadó munkáltatóktól
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Szűrők */}
        <aside className="shrink-0 lg:w-64">
          <AllasokFilterClient defaults={searchParams} />
        </aside>

        {/* Eredmények */}
        <div className="flex-1">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
              <Briefcase className="mx-auto mb-3 text-gray-300" size={40} />
              <p className="font-semibold text-gray-500">Nincs találat a szűrőknek megfelelő állás.</p>
              <a href="/vedettmunka/allasok" className="mt-2 block text-sm text-sni-brand-teal hover:underline">
                Szűrők törlése
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => {
                const loc = job.work_location_type as keyof typeof locationIcon;
                const tags = jobTags(job);
                return (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-gray-100 bg-white p-5 transition hover:border-sni-brand-teal/30 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${job.work_type === "szellemi" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                            {job.work_type === "szellemi" ? "Szellemi" : "Fizikai"}
                          </span>
                          {loc && locationLabel[loc] && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              {locationIcon[loc]} {locationLabel[loc]}
                            </span>
                          )}
                          {job.job_category && (
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                              {job.job_category}
                            </span>
                          )}
                        </div>
                        <h2 className="mt-2 text-lg font-extrabold text-sni-brand-navy">{job.title}</h2>
                        <p className="mt-0.5 text-sm text-gray-600">
                          {(job.employers as { company_name: string } | null)?.company_name}
                        </p>
                        <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                          <MapPin size={13} />
                          {job.city}{job.county ? `, ${job.county}` : ""}
                        </div>
                        {job.daily_hours && (
                          <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                            <Clock size={13} />
                            {job.daily_hours}
                          </div>
                        )}
                        {tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-sni-brand-teal/10 px-2.5 py-0.5 text-xs font-medium text-sni-brand-teal"
              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4">
                      <Link
                        href={`/vedettmunka/allasok/${job.id}`}
                        className="inline-block rounded-full bg-sni-brand-navy px-5 py-2 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
                      >
                        Megnézem
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
