import Link from "next/link";
import { FlaskConical } from "lucide-react";
import TeszteloClient from "./TeszteloClient";

export const metadata = { title: "Admin – Tesztelők kezelése" };
export const dynamic = "force-dynamic";

export default function TesztelokPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">← Admin áttekintés</Link>
      <div className="mt-3 flex items-center gap-3">
        <FlaskConical className="text-sni-brand-teal" size={24} />
        <h1 className="text-2xl font-bold text-sni-text">Tesztelők kezelése</h1>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Keress rá egy felhasználó e-mail-címére, majd kapcsold be vagy ki, melyik pilot modulhoz fér hozzá.
        A közönség előtt rejtett modulok megjelennek a fejlécben annak, akinek bekapcsoltad.
      </p>
      <TeszteloClient />
    </div>
  );
}
