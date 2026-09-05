import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedJobById } from "@/lib/vedettmunka/data";
import JelentkezesClient from "./JelentkezesClient";

export const metadata = { title: "Jelentkezés – VédettKarrier" };
export const dynamic = "force-dynamic";

export default async function JelentkezesPage(
  props: {
    params: Promise<{ jobId: string }>;
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/belepes?next=/vedettmunka/jelentkezes/${params.jobId}`);

  const job = await getPublishedJobById(params.jobId);
  if (!job) notFound();

  const adminClient = createAdminClient();
  const { data: employerRow } = await adminClient
    .from("employers")
    .select("company_name, privacy_policy_url")
    .eq("id", job.employer_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const companyName = employerRow?.company_name ?? (job.employers as { company_name: string } | null)?.company_name ?? "";
  const privacyUrl = employerRow?.privacy_policy_url ?? null;
  const isErdeklodes = searchParams.tipus === "erdeklodes";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={`/vedettmunka/allasok/${job.id}`} className="text-sm text-sni-brand-blue hover:underline">
        ← Vissza a lehetőségkártyához
      </a>

      {/* Mód-váltó */}
      <div className="mt-4 flex gap-2">
        <a
          href={`/vedettmunka/jelentkezes/${job.id}?tipus=erdeklodes`}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            isErdeklodes
              ? "bg-sni-brand-teal text-sni-brand-navy"
              : "border border-gray-200 text-gray-500 hover:border-sni-brand-teal"
          }`}
        >
          Érdeklődöm
        </a>
        <a
          href={`/vedettmunka/jelentkezes/${job.id}`}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            !isErdeklodes
              ? "bg-sni-brand-navy text-white"
              : "border border-gray-200 text-gray-500 hover:border-sni-brand-navy"
          }`}
        >
          Jelentkezem
        </a>
      </div>

      <h1 className="mt-4 text-2xl font-extrabold text-sni-brand-navy">
        {isErdeklodes ? "Érdeklődés" : "Jelentkezés"}
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        <strong>{job.title}</strong> · {companyName}
      </p>

      {isErdeklodes && (
        <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
          Még nem szeretnél teljes jelentkezést küldeni? Küldhetsz rövid érdeklődést is a hirdető partnernek.
          Dokumentumcsatolás nem kötelező.
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
        <JelentkezesClient
          jobId={job.id}
          jobTitle={job.title}
          companyName={companyName}
          employerPrivacyUrl={privacyUrl}
          applicationEmail={job.application_email}
          defaultName={profile?.display_name ?? ""}
          defaultEmail={user.email ?? ""}
          userId={user.id}
          employerId={job.employer_id}
          isErdeklodes={isErdeklodes}
        />
      </div>
    </div>
  );
}
