import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyWorkProfile } from "@/lib/vedettmunka/data";
import MunkaprofilClient from "./MunkaprofilClient";

export const metadata = { title: "Saját Munkaprofil" };
export const dynamic = "force-dynamic";

export default async function MunkaprofilPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes");

  const profile = await getMyWorkProfile();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Fejléc */}
      <Link href="/vedettmunka" className="text-sm text-sni-brand-blue hover:underline">
        ← VédettMunka
      </Link>
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-sni-brand-navy to-sni-brand-blue p-6 text-white">
        <h1 className="text-2xl font-extrabold">Saját Munkaprofil</h1>
        <p className="mt-1 text-blue-200 text-sm">
          Mondd el, milyen munkakörnyezet illik hozzád – preferenciák alapján, nem diagnózis alapján.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
        <MunkaprofilClient
          initialSlugs={profile?.attribute_slugs ?? []}
          initialNotes={profile?.notes ?? ""}
        />
      </div>

      {/* Álláskeresés CTA */}
      <div className="mt-4 rounded-2xl border border-sni-brand-teal/20 bg-sni-brand-teal/5 p-5 text-center">
        <p className="text-sm font-semibold text-sni-brand-navy mb-3">
          A profilod alapján kereshetsz neked való állásokat.
        </p>
        <Link
          href="/vedettmunka/allasok"
          className="inline-block rounded-full bg-sni-brand-navy px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
        >
          Állások böngészése →
        </Link>
      </div>
    </div>
  );
}
