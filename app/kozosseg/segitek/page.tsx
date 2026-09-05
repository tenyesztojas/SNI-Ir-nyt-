import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getPublicHelpSettingsList } from "@/lib/community/data";
import { HELP_NEEDED_CATEGORIES, HELP_OFFERED_CATEGORIES } from "@/lib/community/types";

export const metadata = { title: "Közösségi segítség – VédettSarok" };
export const dynamic = "force-dynamic";

const FILTER_CATEGORIES = [
  { value: "", label: "Mind" },
  { value: "ugyintezesben_segitseg", label: "Ügyintézés" },
  { value: "idopontra_elkiseres", label: "Kísérés" },
  { value: "sorstars_beszelgetes", label: "Sorstársi beszélgetés" },
  { value: "tapasztalatmegosztas", label: "Tapasztalatmegosztás" },
  { value: "kozos_programra_elkiseres", label: "Közös program" },
  { value: "szallitasban_segitseg", label: "Szállításban segítség" },
  { value: "gyermek_melletti_jelenlét", label: "Gyermek melletti jelenlét" },
  { value: "egyeb", label: "Egyéb" },
];

export default async function SegitiPage(
  props: {
    searchParams: Promise<{ filter?: string; category?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const filter = searchParams.filter ?? "";
  const category = searchParams.category ?? "";

  const list = await getPublicHelpSettingsList({
    help_needed: filter === "needed" || undefined,
    help_offered: filter === "offered" || undefined,
    category: category || undefined,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-text mb-2">Közösségi segítség</h1>
      <p className="text-sm text-gray-500 mb-1">
        Közösségi tagok, akik önkéntes segítséget kérnek vagy felajánlanak.
      </p>
      <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        A VédettSarok csak a kapcsolatfelvételi felületet biztosítja. A konkrét segítségnyújtás a felek saját felelőssége.
        Ez nem gyermekfelügyeleti, személyszállítási, egészségügyi vagy sürgősségi szolgáltatás.
      </div>

      {/* Szűrők */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { value: "", label: "Mindenki" },
          { value: "needed", label: "Segítséget kér" },
          { value: "offered", label: "Segítséget ajánl" },
        ].map(({ value, label }) => (
          <Link
            key={value}
            href={`/kozosseg/segitek?filter=${value}&category=${category}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === value
                ? "bg-sni-brand-teal text-sni-brand-navy"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_CATEGORIES.map(({ value, label }) => (
          <Link
            key={value}
            href={`/kozosseg/segitek?filter=${filter}&category=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              category === value
                ? "bg-sni-brand-navy text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {list.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-semibold mb-2">Nincs találat</p>
          <p className="text-sm">Próbálj más szűrőt, vagy kapcsold be a saját beállításodat!</p>
          <Link href="/kozosseg/profilom" className="mt-4 inline-block rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy">
            Saját beállítás
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {list.map((item) => {
          const allCats = [...item.help_needed_categories, ...item.help_offered_categories]
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 5);

          return (
            <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
              <div className="flex flex-wrap gap-2 mb-3">
                {item.help_needed_enabled && (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 font-medium">Segítséget kér</span>
                )}
                {item.help_offered_enabled && (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700 font-medium">Segítséget ajánl</span>
                )}
                {allCats.map((cat) => {
                  const label =
                    HELP_NEEDED_CATEGORIES.find((c) => c.value === cat)?.label ??
                    HELP_OFFERED_CATEGORIES.find((c) => c.value === cat)?.label ??
                    cat;
                  return (
                    <span key={cat} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                      {label}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                {item.visibility === "county" ? "Megye szintű láthatóság" : "Város / kerület szintű láthatóság"}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                A kapcsolatfelvételhez keresd meg a profilt a tagjainknál.
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <strong>Adatvédelmi emlékeztető:</strong> Ne ossz meg nyilvánosan gyermeknevet, pontos lakcímet, iskola vagy óvoda nevét, diagnózist, egészségügyi adatot vagy más érzékeny személyes adatot. A részleteket csak privát üzenetben egyeztesd.
      </div>
    </div>
  );
}
