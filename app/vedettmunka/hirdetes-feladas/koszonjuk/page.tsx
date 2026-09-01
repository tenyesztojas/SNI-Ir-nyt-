import Link from "next/link";

export const metadata = { title: "Hirdetés beküldve" };

export default function KoszonjukPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 sm:px-6 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-extrabold text-sni-brand-navy">Köszönjük a hirdetést!</h1>
      <p className="mt-3 text-gray-600">
        A hirdetésedet megkaptuk. Az üzemeltető átnézi, és értesítünk, ha publikálásra kerül.
      </p>
      <p className="mt-2 text-sm text-gray-400">
        Ez általában 1–2 munkanapot vesz igénybe.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/vedettmunka/hirdetes-feladas"
          className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:border-gray-400"
        >
          Új hirdetés feladása
        </Link>
        <Link
          href="/vedettmunka/allasok"
          className="rounded-full bg-sni-brand-navy px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sni-brand-blue"
        >
          Állások böngészése →
        </Link>
      </div>
    </div>
  );
}
