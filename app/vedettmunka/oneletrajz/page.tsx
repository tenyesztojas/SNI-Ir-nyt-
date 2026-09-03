import Link from "next/link";
import { FileText, Download, Shield } from "lucide-react";

export const metadata = { title: "Bemutatkozó lap készítő – VédettKarrier" };

export default function OneletrajzPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sni-brand-teal/10">
        <FileText className="text-sni-brand-teal" size={32} />
      </div>
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Bemutatkozó lap készítő</h1>
      <p className="mt-3 text-gray-600 leading-relaxed">
        Készíts egyszerű, átlátható bemutatkozó lapot, amit csatolhatsz egy VédettKarrier lehetőséghez.
        Kérdésekre válaszolsz, mi pedig összerakjuk a dokumentumot. A végén PDF-ként mentheted le.
      </p>

      {/* Három típus */}
      <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {[
          {
            title: "Rövid bemutatkozó lap",
            desc: "Ez egy rövid, 1 oldalas bemutatkozás. Akkor jó, ha gyorsan szeretnél jelentkezni.",
            badge: "Gyors",
            color: "border-sni-brand-teal/30 bg-sni-brand-teal/5",
          },
          {
            title: "Részletes bemutatkozó lap",
            desc: "Ez hosszabb bemutatkozás. Akkor jó, ha több munkádról vagy tapasztalatodról szeretnél írni.",
            badge: "Részletes",
            color: "border-sni-brand-blue/30 bg-sni-brand-blue/5",
          },
          {
            title: "Rugalmas munkavállalási profil",
            desc: "Ez nem klasszikus bemutatkozás. Azt mutatja meg, milyen munkaidő, környezet és kommunikáció illik hozzád.",
            badge: "Egyedi",
            color: "border-purple-200 bg-purple-50",
          },
        ].map(({ title, desc, badge, color }) => (
          <div key={title} className={`rounded-2xl border p-4 ${color}`}>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{badge}</span>
            <p className="mt-1 font-bold text-sni-brand-navy text-sm leading-snug">{title}</p>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-4 text-left">
        {[
          { icon: FileText, title: "Kérdésalapú kitöltés", text: 'Egyszerű kérdések, pl. „Milyen munkaidő illik az életedhez?” – nem HR-sablon.' },
          { icon: Download, title: "PDF letöltés", text: "Elkészül a bemutatkozó lapod PDF-ként. A fájl neve: vedettkarrier-bemutatkozo-lap.pdf" },
          { icon: Shield, title: "Adataid nálad maradnak", text: "Az adatokat nem tároljuk. A böngésződben él, te döntöd el, mit teszel vele." },
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
        <strong>Fontos:</strong> A VédettKarrier bemutatkozó lap készítője segít PDF-dokumentumot készíteni.
        Mentsd el saját eszközödre. A VédettSarok nem tárolja tartósan a bemutatkozó lapodat.
        Nincs CV-adatbázis.
      </div>

      <Link
        href="/vedettmunka/oneletrajz/szerkeszto"
        className="mt-8 inline-block rounded-full bg-sni-brand-teal px-8 py-3 font-bold text-sni-brand-navy transition hover:bg-sni-brand-blue hover:text-white"
      >
        Bemutatkozó lap készítése
      </Link>
    </div>
  );
}
