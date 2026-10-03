// Védett Útvonal — könnyű betöltő héj (2026-10-03, startup performance).
//
// A /vedett-utvonal oldal force-dynamic és aszinkron (Supabase session +
// profil), ezért loading.tsx nélkül a böngésző/WebView addig semmit nem kap.
// Ez a héj azonnal streamelődik, amíg a tényleges oldal készül. SZÁNDÉKOSAN
// nincs benne: térkép, Supabase, kliens JS, animáció, külső kérés — csak a
// saját (same-origin) logó és szöveg.

export default function Loading() {
  return (
    <div
      className="mx-auto flex min-h-[60vh] max-w-4xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6"
      role="status"
      aria-live="polite"
    >
      <img
        src="/vedett-utvonal-logo-icon.png"
        alt=""
        aria-hidden="true"
        width={128}
        height={115}
        className="h-[72px] w-auto"
      />
      <p className="mt-4 text-xl font-extrabold text-sni-text">Védett Útvonal</p>
      <p className="mt-1 text-sm text-gray-500">Betöltés…</p>
    </div>
  );
}
