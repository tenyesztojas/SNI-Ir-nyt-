import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyEmployer } from "@/lib/vedettmunka/data";
import MunkaltatoiRegForm from "./MunkaltatoiRegForm";

export const metadata = { title: "Karrierpartner jelentkezés – VédettKarrier" };
export const dynamic = "force-dynamic";

export default async function MunkaltatoiRegPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const existing = await getMyEmployer();

  if (existing) {
    const statusText: Record<string, string> = {
      pending_review: "A regisztrációd jóváhagyásra vár. E-mailben értesítünk a döntésről.",
      approved: "A karrierpartneri fiókod jóváhagyott. Lehetőségkártyát a Lehetőség feladása menüponton tudsz feladni.",
      rejected: "A regisztrációd sajnos elutasításra került. Vedd fel a kapcsolatot velünk.",
      suspended: "A karrierpartneri fiókod felfüggesztve.",
    };
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 text-center">
        <h1 className="text-xl font-bold text-sni-brand-navy">Karrierpartner státusz</h1>
        <p className="mt-3 text-gray-700">{statusText[existing.status] ?? existing.status}</p>
        {existing.status === "approved" && (
          <a
            href="/vedettmunka/hirdetes-feladas"
            className="mt-5 inline-block rounded-full bg-sni-brand-teal px-7 py-3 font-bold text-sni-brand-navy"
          >
            Lehetőségkártya feladása
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Karrierpartner jelentkezés</h1>
      <p className="mt-2 text-sm text-gray-600">
        A regisztráció után admin jóváhagyást követően adhatsz fel lehetőségkártyát.
      </p>
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
        <MunkaltatoiRegForm />
      </div>
    </div>
  );
}
