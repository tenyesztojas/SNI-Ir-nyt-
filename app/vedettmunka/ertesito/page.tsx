import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyJobAlert } from "@/lib/vedettmunka/data";
import ErtesitoClient from "./ErtesitoClient";

export const metadata = { title: "Állásértesítő" };
export const dynamic = "force-dynamic";

export default async function ErtesitoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes?next=/vedettmunka/ertesito");

  const alert = await getMyJobAlert();

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Állásértesítő</h1>
      <p className="mt-1 text-sm text-gray-500">
        Beállítod, milyen állások érdekelnek — e-mailben értesítünk, ha passol valami.
      </p>
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
        <ErtesitoClient initialAlert={alert} />
      </div>
    </div>
  );
}
