import KarrieriranytClient from "./KarrieriranytClient";

export const metadata = { title: "Karrieriránytű – VédettKarrier" };

export default function KarrieriranytPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-4xl" aria-hidden>🧭</span>
        <div>
          <h1 className="text-2xl font-extrabold text-sni-brand-navy">Karrieriránytű</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Gondold végig, milyen munka illik jobban a mindennapjaidhoz — nincs pontozás, nincs diagnózis.
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <KarrieriranytClient />
      </div>
    </div>
  );
}
