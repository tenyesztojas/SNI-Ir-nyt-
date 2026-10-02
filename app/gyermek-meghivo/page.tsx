import Link from "next/link";
import { KeyRound } from "lucide-react";
import { getCurrentUserAndProfile } from "@/lib/data";
import { previewChildAccountInvitation } from "@/lib/family/data";
import AcceptChildAccountInvitationForm from "@/components/family/AcceptChildAccountInvitationForm";
import type { Metadata } from "next";

// /gyermek-meghivo?token=... — Gyermekfiók-meghívó TÁJÉKOZTATÓ +
// elfogadó oldal.
//
// SZÁNDÉKOSAN NEM a /csalad oldal hozzáférés-kapuja mögött van: ez egy
// ÖNÁLLÓ, keskeny belépési pont, aminek a jogosultságát KIZÁRÓLAG a
// link-ben lévő token adja — nem a family_db_beta/meghívás/tagság
// hármas. Az ELŐNÉZET (lásd previewChildAccountInvitation(),
// lib/family/data.ts és a preview_child_account_invitation(text) RPC,
// supabase/migrations/20261002_child_account_invitation_preview.sql)
// MÉG BEJELENTKEZÉS ELŐTT is lekérdezhető (a RPC anon-nak is
// futtatható) — ez teszi lehetővé, hogy a felhasználó MÁR a
// belépés/regisztráció ELŐTT lássa, kinek szól a meghívás, mielőtt
// fiókot hoz létre vagy bejelentkezik. A TÉNYLEGES elfogadást
// (accept_child_account_invitation RPC) ettől függetlenül továbbra is
// csak bejelentkezve lehet megtenni.
//
// GENERIKUS "ÉRVÉNYTELEN" ÁLLAPOT: a preview RPC szándékosan NEM
// különbözteti meg az érvénytelen/lejárt/visszavont/már elfogadott
// tokeneket egymástól (mindegyik nulla sort ad) — ez a oldal ezért
// egyetlen, megkülönböztethetetlen üzenetet jelenít meg mindegyik
// esetben, hogy ne szivárogtasson információt arról, hogy egy adott
// token valaha is létezett-e.
export const metadata: Metadata = {
  title: "Gyermekfiók-meghívás – VédettSarok",
};

function InvalidInvitationNotice() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <KeyRound className="mx-auto text-gray-400" size={40} />
      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        Gyermekfiók-meghívás
      </h1>
      <p className="mt-3 text-gray-600">Ez a meghívás már nem érvényes.</p>
    </div>
  );
}

export default async function GyermekMeghivoPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token.trim() : "";

  if (!token) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <KeyRound className="mx-auto text-gray-400" size={40} />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          Gyermekfiók-meghívás
        </h1>
        <p className="mt-3 text-gray-600">
          Ehhez a laphoz a szülődtől/gondviselődtől kapott meghívó-linket
          kell megnyitnod.
        </p>
      </div>
    );
  }

  const [{ preview }, { user }] = await Promise.all([
    previewChildAccountInvitation(token),
    getCurrentUserAndProfile(),
  ]);

  if (!preview) {
    return <InvalidInvitationNotice />;
  }

  const childName = preview.childFirstName;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <KeyRound className="mx-auto text-sni-brand-blue" size={40} />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          Gyermekfiók-meghívás
        </h1>
      </div>

      <p className="mt-6 text-gray-700">
        Meghívást kaptál, hogy a VédettSarok rendszerben használd{" "}
        <strong>{childName}</strong> gyermekfiókját.
      </p>

      <h2 className="mt-6 text-base font-semibold text-gray-900">
        Mi az a VédettSarok?
      </h2>
      <p className="mt-2 text-gray-700">
        A VédettSarok egy digitális szolgáltatás, amely többek között a
        mindennapi tervezést és a biztonságosabb, kiszámíthatóbb
        közlekedést segítő funkciókat biztosít.
      </p>

      <h2 className="mt-6 text-base font-semibold text-gray-900">
        Mi az a Gyermekfiók?
      </h2>
      <p className="mt-2 text-gray-700">
        A Gyermekfiók a VédettSarokban létrehozott gyermekprofilhoz
        kapcsolódó saját felhasználói hozzáférés.
      </p>
      <p className="mt-2 text-gray-700">
        A meghívás elfogadásával a jelenleg bejelentkezett
        VédettSarok-fiókod összekapcsolódik {childName} már meglévő
        gyermekprofiljával.
      </p>

      <h2 className="mt-6 text-base font-semibold text-gray-900">
        Mit tudsz most használni?
      </h2>
      <p className="mt-2 text-gray-700">
        A Gyermekfiókban jelenleg megtekintheted a saját Napirendedet. A
        Napirendben például megjelenhet:
      </p>
      <ul className="mt-2 list-disc pl-5 text-gray-700">
        <li>egy program vagy esemény neve</li>
        <li>időpont</li>
        <li>indulási idő</li>
        <li>érkezési idő</li>
        <li>indulási hely</li>
        <li>célállomás</li>
      </ul>

      <h2 className="mt-6 text-base font-semibold text-gray-900">
        Mit nem jelent a Gyermekfiók?
      </h2>
      <p className="mt-2 text-gray-700">A Gyermekfiókkal nem kapsz hozzáférést:</p>
      <ul className="mt-2 list-disc pl-5 text-gray-700">
        <li>más gyermekek profiljához</li>
        <li>testvérek adataihoz</li>
        <li>a család teljes kezeléséhez</li>
        <li>gondviselők kezeléséhez</li>
        <li>más gyermekek napirendjéhez</li>
      </ul>
      <p className="mt-2 text-gray-700">
        A saját Napirendedet sem tudod a Gyermekfiókkal létrehozni,
        módosítani vagy törölni — azt a gyermeket kezelő
        szülő/gondviselő állítja be.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        A Gyermekfiók funkciói a VédettSarok fejlesztésével később
        bővülhetnek.
      </p>

      <h2 className="mt-6 text-base font-semibold text-gray-900">
        Mi történik, ha az &bdquo;Elfogadás&rdquo; gombra kattintasz?
      </h2>
      <p className="mt-2 text-gray-700">
        A jelenleg bejelentkezett VédettSarok-fiókod összekapcsolódik{" "}
        {childName} már meglévő gyermekprofiljával. Csak akkor fogadd el
        a meghívást, ha azt neked szánták.
      </p>

      <p className="mt-6 text-sm text-gray-500">
        <Link href="/adatkezelesi-tajekoztato" className="underline hover:text-sni-brand-blue">
          Adatkezelési tájékoztató
        </Link>
        {" · "}
        <Link href="/aszf" className="underline hover:text-sni-brand-blue">
          Általános Szerződési Feltételek
        </Link>
      </p>

      {user ? (
        <AcceptChildAccountInvitationForm token={token} />
      ) : (
        <div className="mt-6">
          <p className="text-gray-600">
            Jelentkezz be (vagy regisztrálj) a meghívás elfogadásához.
          </p>
          <Link
            href={`/belepes?next=${encodeURIComponent(
              `/gyermek-meghivo?token=${token}`
            )}`}
            className="btn-primary mt-4 inline-flex"
          >
            Belépés / Regisztráció
          </Link>
        </div>
      )}
    </div>
  );
}
