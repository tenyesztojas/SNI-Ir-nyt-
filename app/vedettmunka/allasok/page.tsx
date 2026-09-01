import Link from "next/link";
import { Briefcase, MapPin, Clock, Building2, Home, Blend } from "lucide-react";
import { getPublishedJobs, getPublishedJobCounties } from "@/lib/vedettmunka/data";
import { deriveAttributesFromJobPost } from "@/lib/vedettmunka/attributes";
import type { JobPost } from "@/lib/vedettmunka/types";
import AllasokFilterClient from "./AllasokFilterClient";
import VmAttributeChip from "@/components/vedettmunka/VmAttributeChip";

export const metadata = { title: "Állások keresése" };
export const dynamic = "force-dynamic";

const LOC_ICON = {
  munkahelyen: <Building2 size={13} className="shrink-0" />,
  otthonrol:   <Home size={13} className="shrink-0" />,
  hibrid:      <Blend size={13} className="shrink-0" />,
};
const LOC_LABEL = {
  munkahelyen: "Helyszíni",
  otthonrol:   "Home office",
  hibrid:      "Hibrid",
};

export default async function AllasokPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const filters = {
    work_type:          searchParams.work_type || undefined,
    category:           searchParams.category  || undefined,
    city:               searchParams.city      || undefined,
    county:             searchParams.county    || undefined,
    work_location_type: searchParams.location  || undefined,
    part_time:          searchParams.part_time  === "1",
    mentor:             searchParams.mentor     === "1" || searchParams.betanitas === "1",
    written_instructions: searchParams.written  === "1",
    quiet_environment:  searchParams.quiet      === "1",
    low_verbal:         searchParams.low_verbal === "1",
    q:                  searchParams.q          || undefined,
  };

  const [jobs, availableCounties] = await Promise.all([
    getPublishedJobs(filters),
    getPublishedJobCounties(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Állások keresése</h1>
      <p className="mt-1 text-sm text-gray-500">
        {jobs.length === 0
          ? "Nincs találat – próbáld más szűrőkkel"
          : `${jobs.length} hirdetés befogadó munkáltatóktól`}
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Szűrő panel */}
        <aside className="shrink-0 lg:w-64">
          <AllasokFilterClient defaults={searchParams} counties={availableCounties} />
        </aside>

        {/* Találatok */}
        <div className="flex-1">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
              <Briefcase className="mx-auto mb-3 text-gray-300" size={40} />
              <p className="font-semibold text-gray-500">Nincs találat a megadott szűrőkkel.</p>
              <a href="/vedettmunka/allasok" className="mt-2 block text-sm text-sni-brand-teal hover:underline">
                Szűrők törlése
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => {
                const loc = job.work_location_type as keyof typeof LOC_ICON;
                const attrs = deriveAttributesFromJobPost(job).slice(0, 5);

                return (
                  <article
                    key={job.id}
                    className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft transition hover:border-sni-brand-teal/30 hover:shadow-softHover"
                  >
                    {/* Fejléc */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${
                        job.work_type === "szellemi" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {job.work_type === "szellemi" ? "Szellemi" : "Fizikai"}
                      </span>
                      {loc && LOC_LABEL[loc] && (
                        <span className="flex items-center gap-1 text-gray-400">
                          {LOC_ICON[loc]} {LOC_LABEL[loc]}
                        </span>
                      )}
                      {job.job_category && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-600">
                          {job.job_category}
                        </span>
                      )}
                    </div>

                    {/* Cím */}
                    <h2 className="mt-2 text-lg font-extrabold text-sni-brand-navy leading-snug">
                      {job.title}
                    </h2>
                    <p className="text-sm font-semibold text-gray-600">
                      {(job.employers as { company_name: string } | null)?.company_name}
                    </p>

                    {/* Meta */}
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-400">
                      {(job.city || job.county) && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} />
                          {job.city}{job.county ? `, ${job.county}` : ""}
                        </span>
                      )}
                      {job.daily_hours && (
                        <span className="flex items-center gap-1">
                          <Clock size={13} />
                          {job.daily_hours}
                        </span>
                      )}
                      {job.salary_range && job.salary_range !== "" && (
                        <span className="font-medium text-sni-brand-navy">{job.salary_range}</span>
                      )}
                    </div>

                    {/* Piktogram chipek */}
                    {attrs.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {attrs.map((slug) => (
                          <VmAttributeChip key={slug} slug={slug} size="sm" />
                        ))}
                      </div>
                    )}

                    {/* CTA */}
                    <div className="mt-4">
                      <Link
                        href={`/vedettmunka/allasok/${job.id}`}
                        className="inline-block rounded-full bg-sni-brand-navy px-5 py-2 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
                      >
                        Megnézem →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
