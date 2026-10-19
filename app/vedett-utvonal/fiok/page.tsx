import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import {
  VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH,
  VEDETT_UTVONAL_AFTER_DELETE_PATH,
} from "@/lib/vedett-route/native/iosAccount";

export const metadata: Metadata = {
  title: "Fiókom és fióktörlés – Védett Útvonal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// VÉDETT ÚTVONAL — fiókoldal (App Review 5.1.1(v)). A natív iOS app
// fiók-sávjából érhető el (components/vedett-utvonal/IosAccountLink.tsx).
// Minden hivatkozás és a törlés utáni átirányítás a /vedett-utvonal előtagon
// belül marad (vagy a meglévő, kliensoldalon elért /belepes oldalra visz
// vissza ide), így a Capacitor iOS nem nyit Safarit. A törlés UGYANAZ, mint a
// /profil oldalon (DeleteAccountSection + /api/account/delete).
export default async function VedettUtvonalAccountPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6" data-testid="vedett-utvonal-account-page">
      <Link
        href={VEDETT_UTVONAL_AFTER_DELETE_PATH}
        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sni-brand-blue hover:underline"
      >
        ← Vissza a Védett Útvonalhoz
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-sni-text">Fiókom és fióktörlés</h1>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900" data-testid="vedett-utvonal-account-scope">
        <p className="font-semibold">A Védett Útvonal a VédettSarok-fiókodat használja.</p>
        <p className="mt-1">
          A fiók törlése a <strong>teljes VédettSarok-fiókot</strong> véglegesen törli – nem csak a Védett
          Útvonalat. A törlés után a fiókkal nem tudsz belépni sem a VédettSarok weboldalra, sem a Védett Útvonal
          webes, Android vagy iOS alkalmazásába. A fiókhoz tartozó személyes adatok (többek között a profil, a
          mentett helyek, a kedvenc útvonalak, a saját pihenőpontok és az értesítési feliratkozások) törlésre
          kerülnek, kivéve azokat, amelyeket jogszabály alapján tovább kell megőriznünk.
        </p>
      </div>

      {user ? (
        <>
          <p className="mt-6 text-sm text-gray-700">
            Bejelentkezve:{" "}
            <span className="font-semibold">{profile?.displayName || user.email}</span>
            {profile?.displayName && user.email ? <span className="text-gray-500"> ({user.email})</span> : null}
          </p>
          <DeleteAccountSection afterDeleteHref={VEDETT_UTVONAL_AFTER_DELETE_PATH} />
        </>
      ) : (
        <div className="mt-6 text-sm text-gray-700">
          <p>A fiókod kezeléséhez és törléséhez jelentkezz be.</p>
          <Link
            href={VEDETT_UTVONAL_ACCOUNT_LOGIN_PATH}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-sni-brand-teal px-5 font-bold text-white hover:bg-sni-brand-blue"
          >
            Belépés
          </Link>
        </div>
      )}

      <p className="mt-6 text-sm text-gray-600">
        Ha nem tudsz bejelentkezni, írj nekünk:{" "}
        <a href="mailto:kapcsolat@vedettsarok.hu" className="underline">kapcsolat@vedettsarok.hu</a>.
      </p>
    </div>
  );
}
