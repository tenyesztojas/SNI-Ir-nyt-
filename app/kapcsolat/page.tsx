import KapcsolatForm from "./KapcsolatForm";

export const metadata = {
  title: "Kapcsolat – VédettSarok",
  description: "Vedd fel velünk a kapcsolatot!",
};

export default function KapcsolatPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-sni-text">Kapcsolat</h1>
      <p className="mt-3 text-gray-600">
        Kérdésed van? Szeretnél együttműködni? Írj nekünk, és hamarosan válaszolunk.
      </p>

      <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        Az adatkezelési tájékoztató <a href="/adatkezelesi-tajekoztato" className="underline">itt olvasható</a>.
        A megkeresésedben kérjük, ne adj meg érzékeny egészségügyi adatot.
      </div>

      <div className="mt-8 card">
        <KapcsolatForm />
      </div>
    </div>
  );
}
