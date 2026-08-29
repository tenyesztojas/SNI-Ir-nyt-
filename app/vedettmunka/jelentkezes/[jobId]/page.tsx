import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedJobById } from "@/lib/vedettmunka/data";
import JelentkezesClient from "./JelentkezesClient";

export const metadata = { title: "Jelentkezés" };
export const dynamic = "force-dynamic";

export default async function JelentkezesPage({ params }: { params: { jobId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/belepes?next=/vedettmunka/jelentkezes/${params.jobId}`);

  const job = await getPublishedJobById(params.jobId);
  if (!job) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={`/vedettmunka/allasok/${job.id}`} className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza az álláshirdetéshez
      </a>
      <h1 className="mt-3 text-2xl font-extrabold text-sni-brand-navy">Jelentkezés</h1>
      <p className="mt-1 text-sm text-gray-600">
        Pozíció: <strong>{job.title}</strong> ·{" "}
        {(job.employers as { company_name: string } | null)?.company_name}
      </p>
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
        <JelentkezesClient
          jobId={job.id}
          jobTitle={job.title}
          applicationEmail={job.application_email}
          defaultName={profile?.display_name ?? ""}
          defaultEmail={user.email ?? ""}
          userId={user.id}
          employerId={job.employer_id}
        />
      </div>
    </div>
  );
}
