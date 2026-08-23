import Link from "next/link";
import { Users, Map, Search, Shield } from "lucide-react";
import { getOwnCommunityProfile } from "@/lib/community/data";
import { getCurrentUserAndProfile } from "@/lib/data";

export const metadata = {
  title: "VédettSarok Közösség",
  description: "Biztonságos kapcsolódási tér szülőknek, érintett felnőtteknek és szakembereknek.",
};

export const dynamic = "force-dynamic";

export default async function KozossegPage() {
  const [{ user }, ownProfile] = await Promise.all([
    getCurrentUserAndProfile(),
    getOwnCommunityProfile(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-sni-brand-teal/10 to-sni-brand-blue/10 px-8 py-12 text-center">
        <h1 className="text-3xl font-extrabold text-sni-text sm:text-4xl">
          Kapcsolódj olyan emberekhez,
          <br className="hidden sm:block" />
          akik értik, milyen, amikor túl sok a világ.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-gray-600">
          A VédettSarok Közösségben szülők, érintett felnőttek és szakemberek találhatnak
          egymásra. Létrehozhatsz egy közösségi profilt, megjelenhetsz város vagy kerület szinten
          a térképen, és kapcsolatba léphetsz másokkal.
        </p>

        {!user ? (
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/belepes" className="btn-primary inline-flex items-center gap-2 text-base">
              Bejelentkezés a közösséghez
            </Link>
          </div>
        ) : !ownProfile ? (
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/kozosseg/bekapcsolas"
              className="btn-primary inline-flex items-center gap-2 text-base"
            >
              <Users size={18} />
              Létrehozom a közösségi profilom
            </Link>
            <Link href="/kozosseg/terkep" className="btn-secondary inline-flex items-center gap-2 text-base">
              <Map size={18} />
              Megnézem a közösségi térképet
            </Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/kozosseg/terkep" className="btn-primary inline-flex items-center gap-2 text-base">
              <Map size={18} />
              Megnézem a közösségi térképet
            </Link>
            <Link href="/kozosseg/tagok" className="btn-secondary inline-flex items-center gap-2 text-base">
              <Search size={18} />
              Tagok keresése
            </Link>
            <Link href="/kozosseg/profilom" className="btn-secondary inline-flex items-center gap-2 text-base">
              Profilom szerkesztése
            </Link>
          </div>
        )}

        {/* Adatvédelmi szöveg */}
        <div className="mx-auto mt-6 flex max-w-lg items-start gap-2 rounded-2xl bg-white/70 px-4 py-3 text-left text-sm text-gray-500">
          <Shield size={16} className="mt-0.5 shrink-0 text-sni-brand-teal" />
          <span>
            A közösségi profil teljesen önkéntes. Te döntöd el, mit osztasz meg, ki írhat neked,
            és szeretnél-e megjelenni a térképen. Pontos lakcímet nem jelenítünk meg.
          </span>
        </div>
      </div>

      {/* Funkció kártyák */}
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={<Map className="text-sni-brand-teal" size={28} />}
          title="Közösségi térkép"
          desc="Tekintsd meg, kik vannak a közeledben — csak város vagy kerület szinten, pontos cím nélkül."
          href="/kozosseg/terkep"
          linkLabel="Megnyitom"
        />
        <FeatureCard
          icon={<Search className="text-sni-brand-blue" size={28} />}
          title="Tagok keresése"
          desc="Keress szülőket, érintett felnőtteket és szakembereket szűrőkkel: város, szerepkör, kapcsolódási cél."
          href="/kozosseg/tagok"
          linkLabel="Keresés"
        />
        <FeatureCard
          icon={<Users className="text-green-600" size={28} />}
          title="Kapcsolatok és chat"
          desc="Jelöld ismerősnek azokat, akikkel kapcsolódni szeretnél. Elfogadás után privát chatben tudtok írni egymásnak."
          href={user ? "/kozosseg/kapcsolataim" : "/belepes"}
          linkLabel="Kapcsolataim"
        />
      </div>

      {/* Fontos figyelmeztetés */}
      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-800">
        <p className="font-semibold">Adatvédelmi figyelmeztetés</p>
        <p className="mt-1">
          Kérjük, ne adj meg gyermeknevet, pontos lakcímet, iskola vagy óvoda nevét, illetve olyan
          adatot, amely alapján gyermeked beazonosítható.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="card flex flex-col gap-3">
      {icon}
      <h2 className="font-bold text-sni-text">{title}</h2>
      <p className="flex-1 text-sm text-gray-600">{desc}</p>
      <Link href={href} className="text-sm font-semibold text-sni-brand-teal hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}
