import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/data";
import { getOwnCommunityProfile } from "@/lib/community/data";
import CommunityOnboardingForm from "./CommunityOnboardingForm";

export const metadata = {
  title: "Közösségi profil létrehozása – VédettSarok",
};

export const dynamic = "force-dynamic";

export default async function BekapcsolasPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/belepes");

  const ownProfile = await getOwnCommunityProfile();
  if (ownProfile) redirect("/kozosseg/profilom");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-sni-text">Közösségi profil létrehozása</h1>
      <p className="mt-2 text-gray-600">
        Töltsd ki az alábbi adatokat. Csak olyat adj meg, amit biztonságosan megosztanál
        más regisztrált tagokkal.
      </p>
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold">Fontos</p>
        <p className="mt-1">
          Kérjük, ne adj meg gyermeknevet, pontos lakcímet, iskola vagy óvoda nevét, illetve
          olyan adatot, amely alapján gyermeked beazonosítható.
        </p>
      </div>
      <div className="mt-8">
        <CommunityOnboardingForm />
      </div>
    </div>
  );
}
