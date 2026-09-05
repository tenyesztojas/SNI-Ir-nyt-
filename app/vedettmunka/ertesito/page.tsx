import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyJobAlert } from "@/lib/vedettmunka/data";
import ErtesitoClient from "./ErtesitoClient";

export const metadata = { title: "Lehetőségfigyelő – VédettKarrier" };
export const dynamic = "force-dynamic";

export default async function ErtesitoPage(
  props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/belepes?next=/vedettmunka/ertesito");

  const alert = await getMyJobAlert();
  const justUnsubscribed = searchParams.leiratkozas === "ok";

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Lehetőségfigyelő</h1>
      <p className="mt-1 text-sm text-gray-500">
        Kérj értesítést azokról a lehetőségekről, amelyek megfelelnek az általad beállított szempontoknak.
      </p>
      <p className="mt-2 text-xs text-gray-400">
        Például: otthonról végezhető, részmunkaidős, előre tervezhető vagy rugalmas időbeosztású lehetőségek.
        A lehetőségfigyelő csak az általad kiválasztott szempontok alapján működik.
        Nem használ diagnózist, egészségi állapotot vagy feltételezett neurodivergenciát.
      </p>
      {justUnsubscribed && (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          ✓ Sikeresen leiratkoztál a heti lehetőségfigyelőről. Bármikor újra bekapcsolhatod.
        </div>
      )}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
        <ErtesitoClient initialAlert={alert} />
      </div>
    </div>
  );
}
