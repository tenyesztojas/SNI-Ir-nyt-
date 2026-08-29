import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyEmployer } from "@/lib/vedettmunka/data";
import HirdetesForm from "./HirdetesForm";

export const metadata = { title: "Hirdetés feladása" };
export const dynamic = "force-dynamic";

export default async function HirdetesFeladasPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const employer = await getMyEmployer();

  if (!employer) redirect("/vedettmunka/munkaltatoi-regisztracio");

  if (employer.status !== "approved") {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 text-center">
        <h1 className="text-xl font-bold text-sni-brand-navy">Hirdetés feladása</h1>
        <p className="mt-3 text-gray-700">
          Hirdetést csak jóváhagyott munkáltató adhat fel. A regisztrációd státusza: <strong>{employer.status}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Hirdetés feladása</h1>
      <p className="mt-1 text-sm text-gray-500">
        Munkáltató: <strong>{employer.company_name}</strong>
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Minden hirdetést admin ellenőriz publikálás előtt.
      </p>
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
        <HirdetesForm />
      </div>
    </div>
  );
}
