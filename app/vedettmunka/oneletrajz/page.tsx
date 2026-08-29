import Link from "next/link";
import { FileText, Download, Shield } from "lucide-react";

export const metadata = { title: "Önéletrajz készítése" };

export default function OneletrajzPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sni-brand-teal/10">
        <FileText className="text-sni-brand-teal" size={32} />
      </div>
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">VédettMunka önéletrajz-készítő</h1>
      <p className="mt-3 text-gray-600 leading-relaxed">
        Segítünk lépésről lépésre elkészíteni az önéletrajzodat. Egyszerű kérdésekre válaszolsz,
        mi pedig összerakjuk a dokumentumot. A végén PDF-ként mentheted le.
      </p>

      <div className="mt-8 flex flex-col gap-4 text-left">
        {[
          { icon: FileText, title: "Lépésről lépésre", text: "10 egyszerű lépés: alapadatok, végzettség, munkahelyek, nyelvek és más fontos információk." },
          { icon: Download, title: "PDF letöltés", text: "Elkészül az önéletrajzod PDF-ként. Mentsd le a saját eszközödre, és bármikor felhasználhatod." },
          { icon: Shield, title: "Adataid nálad maradnak", text: "Az önéletrajzod adatait nem tároljuk. A böngésződben él, te döntöd el, mit teszel vele." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-4">
            <Icon className="mt-0.5 shrink-0 text-sni-brand-teal" size={20} />
            <div>
              <p className="font-semibold text-sni-brand-navy">{title}</p>
              <p className="mt-0.5 text-sm text-gray-600">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 text-left">
        <strong>Fontos:</strong> A VédettMunka önéletrajz-készítője segít PDF-önéletrajzot készíteni.
        A dokumentumot mentsd el saját eszközödre. A VédettMunka nem tárolja tartósan az önéletrajzodat.
      </div>

      <Link
        href="/vedettmunka/oneletrajz/szerkeszto"
        className="mt-8 inline-block rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
      >
        Önéletrajz készítése
      </Link>
    </div>
  );
}
