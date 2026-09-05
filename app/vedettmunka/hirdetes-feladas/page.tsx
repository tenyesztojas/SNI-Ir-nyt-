import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyEmployer } from "@/lib/vedettmunka/data";
import HirdetesWizard from "./HirdetesWizard";

export const metadata = { title: "Hirdetés feladása" };
export const dynamic = "force-dynamic";

export default async function HirdetesFeladasPage() {
  const supabase = await createClient();
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

  return <HirdetesWizard />;
}
