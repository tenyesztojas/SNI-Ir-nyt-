import Link from "next/link";
import { Users } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/data";
import { hasFamilyBetaAccess } from "@/lib/family/config";
import { getMyFamilies } from "@/lib/family/data";
import FamilyOnboarding from "@/components/family/FamilyOnboarding";
import FamilyCard from "@/components/family/FamilyCard";
import type { Metadata } from "next";

// /csalad — Family modul, első működő UI verzió a meglévő Family DB
// foundationra (lásd
// supabase/migrations/20260926_family_db_foundation.sql).
//
// SZERVER OLDALI VÉDELEM (nem csak a menüpont van elrejtve): ez az
// oldal Server Component-ként FUT LE, mielőtt bármi a kliensre kerül —
// bejelentkezés nélkül vagy family_db_beta hozzáférés nélkül a Family
// UI JSX-e egyáltalán nem kerül a válaszba, csak egy rövid üzenet.
// Ugyanúgy, mint a Védett Útvonal mintája (lásd app/vedett-utvonal/page.tsx
// és lib/vedett-route/access.ts) — ez a flag-ellenőrzés a UI/rollout
// kontroll, a TÉNYLEGES adathozzáférést a DB/RLS biztosítja
// (lásd lib/family/data.ts és a migrációban lévő policy-k), tehát még
// ha ez a check valamiért kimaradna is egy jövőbeli route-ból, az RLS
// önmagában is megállítaná a jogosulatlan hozzáférést.
export const metadata: Metadata = {
  title: "Család – VédettSarok",
};

export default async function CsaladPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <Users className="mx-auto text-sni-brand-blue" size={40} />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Család</h1>
        <p className="mt-3 text-gray-600">
          Bejelentkezés után itt hozhatod létre a családodat és kezelheted
          a gyermekprofilokat.
        </p>
        <Link href="/belepes?next=/csalad" className="btn-primary mt-6 inline-flex">
          Belépés / Regisztráció
        </Link>
      </div>
    );
  }

  if (!hasFamilyBetaAccess(profile)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <Users className="mx-auto text-gray-400" size={40} />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Család</h1>
        <p className="mt-3 text-gray-600">
          Ez a funkció még nem elérhető a fiókodhoz.
        </p>
      </div>
    );
  }

  const { families, error } = await getMyFamilies(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <Users className="text-sni-brand-blue" size={32} />
        <h1 className="text-2xl font-bold text-gray-900">Család</h1>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Nem sikerült betölteni a családi adatokat. Próbáld frissíteni az
          oldalt.
        </p>
      )}

      {!error && families.length === 0 && (
        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <p className="text-gray-600">
            Hozd létre a családodat, hogy később gyermekprofilokat,
            napirendet és az önálló közlekedést segítő funkciókat
            használhass.
          </p>
          <FamilyOnboarding />
        </div>
      )}

      {!error && families.length > 0 && (
        <div className="mt-6 flex flex-col gap-6">
          {families.map((family) => (
            <FamilyCard key={family.id} family={family} />
          ))}
        </div>
      )}
    </div>
  );
}
