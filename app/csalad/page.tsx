import Link from "next/link";
import { Users } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/data";
import { hasFamilyBetaAccess } from "@/lib/family/config";
import {
  getMyFamilies,
  getPendingGuardianInvitationsForUser,
  getLinkedChildSelfView,
} from "@/lib/family/data";
import FamilyOnboarding from "@/components/family/FamilyOnboarding";
import FamilyCard from "@/components/family/FamilyCard";
import GuardianInvitationInbox from "@/components/family/GuardianInvitationInbox";
import ChildScheduleSection from "@/components/family/ChildScheduleSection";
import type { Metadata } from "next";

// /csalad — Family modul, első működő UI verzió a meglévő Family DB
// foundationra (lásd
// supabase/migrations/20260926_family_db_foundation.sql).
//
// SZERVER OLDALI VÉDELEM (nem csak a menüpont van elrejtve): ez az
// oldal Server Component-ként FUT LE, mielőtt bármi a kliensre kerül —
// bejelentkezés nélkül, ÉS a family_db_beta/meghívás/aktív tagság
// hármas HIÁNYÁBAN a Family UI JSX-e egyáltalán nem kerül a válaszba,
// csak egy rövid üzenet. Ugyanúgy, mint a Védett Útvonal mintája (lásd
// app/vedett-utvonal/page.tsx és lib/vedett-route/access.ts) — ez a
// flag-ellenőrzés a UI/rollout kontroll, a TÉNYLEGES adathozzáférést a
// DB/RLS biztosítja (lásd lib/family/data.ts és a migrációban lévő
// policy-k), tehát még ha ez a check valamiért kimaradna is egy
// jövőbeli route-ból, az RLS önmagában is megállítaná a jogosulatlan
// hozzáférést.
//
// KÖRKÖRÖS ONBOARDING-FÜGGŐSÉG JAVÍTÁSA (production hiba, 2026-10-01) —
// korábban ez az oldal KIZÁRÓLAG a hasFamilyBetaAccess(profile) flaget
// nézte: egy owner sikeresen meghívhatott egy NEM béta-userhez szóló
// guardiant, de a meghívott SOSE léphetett be a /csalad oldalra, hogy
// lássa/elfogadja a meghívást — tehát SOSE válhatott aktív guardiannal.
// A javított hozzáférés-modell (lásd lentebb) NÉGY, EGYMÁSTÓL
// FÜGGETLEN módon ad hozzáférést: admin, family_db_beta,
// SAJÁT (szerveroldali, session-alapú e-mail-címre szóló) függő
// meghívás, VAGY MÁR aktív family_members tagság. Ez SZÁNDÉKOSAN NEM a
// teljes rollout-kapu globális eltávolítása — egy sima, béta nélküli,
// meghívás és családtagság nélküli user TOVÁBBRA IS kimarad.
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

  const [
    { families, error },
    { invitations, error: invitationsError },
    { child: childSelf, error: childSelfError },
  ] = await Promise.all([
    getMyFamilies(user.id),
    getPendingGuardianInvitationsForUser(user.email),
    // Gyermekfiók UI v1 — ÖTÖDIK, a többitől FÜGGETLEN belépési pont:
    // a hívóhoz LINKELT, AKTÍV child_accounts sor (lásd
    // getLinkedChildSelfView() és a 20260927_child_account_foundation.sql
    // migrációt). Egy ilyen userhez SOSE lesz family_members sora (az
    // accept_child_account_invitation RPC explicit blokkolja), tehát ez
    // a belépési pont NEM fedi a fenti négyet, hanem egy ÖTÖDIK, önálló
    // ágat ad hozzá.
    getLinkedChildSelfView(user.id),
  ]);

  // ÖT, EGYMÁSTÓL FÜGGETLEN belépési pont (lásd a fenti fejléc-
  // kommentet) — admin/beta szinkron profil-flag, VAGY saját függő
  // gondviselő-meghívás léte, VAGY MÁR aktív family_members tagság
  // (families.length > 0, amit a getMyFamilies() KIZÁRÓLAG a user
  // TÉNYLEGES family_members sorai alapján tölt, a beta flagtől
  // függetlenül), VAGY egy hozzá linkelt, aktív gyermekfiók
  // (childSelf !== null). Egy sima, a fenti öt közül egyikkel se
  // rendelkező user TOVÁBBRA IS kimarad — ez NEM a rollout-kapu
  // globális megszüntetése.
  const hasAccess =
    hasFamilyBetaAccess(profile) ||
    invitations.length > 0 ||
    families.length > 0 ||
    childSelf !== null;

  if (!hasAccess) {
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

  // GYERMEK-SAJÁT (child-self) ág — KIZÁRÓLAG a minimális, saját
  // napirend-megtekintő nézetet kapja, SOSE az owner/guardian
  // Family-UI-t (lásd a feladat 4. szekcióját: nincs testvér-profil,
  // nincs guardian-kezelés, nincs meghívás-kezelés, nincs "Gyermek
  // hozzáadása", nincs napirend szerkesztés). A childSelf !== null
  // eset a gyakorlatban KIZÁRJA a families.length > 0 esetet (lásd a
  // fenti belépési-pont kommentet), de a UI-ágat így is explicit,
  // KORÁBBAN ágazunk el, mint az owner/guardian renderelés — biztosan
  // SOSE látja egy linkelt gyermek-account az owner/guardian JSX-et,
  // még egy jövőbeli, előre nem látott átfedés esetén sem.
  if (childSelf) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3">
          <Users className="text-sni-brand-blue" size={32} />
          <h1 className="text-2xl font-bold text-gray-900">Család</h1>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <p className="font-medium text-gray-900">{childSelf.firstName}</p>
          {childSelf.birthYear && (
            <p className="text-sm text-gray-500">{childSelf.birthYear}</p>
          )}
          <ChildScheduleSection child={childSelf} canManage={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <Users className="text-sni-brand-blue" size={32} />
        <h1 className="text-2xl font-bold text-gray-900">Család</h1>
      </div>

      {(error || invitationsError || childSelfError) && (
        <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Nem sikerült betölteni a családi adatokat. Próbáld frissíteni az
          oldalt.
        </p>
      )}

      {!invitationsError && <GuardianInvitationInbox invitations={invitations} />}

      {!error && families.length === 0 && hasFamilyBetaAccess(profile) && (
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
