// VÉDETT ÚTVONAL NAVIGATION-ONLY PWA sprint (2026-09-21) — nyílt redirect
// (open redirect) elleni védelem: a bejelentkezés utáni visszatérési
// URL-t (pl. a Védett Útvonal PWA shell start route-ja, /vedett-utvonal/app)
// a felhasználó egy query paraméterben ("next") adja át a /belepes
// oldalnak, ezt AZ ACTION KAPJA VISSZA form mezőként. Mivel ez a
// felhasználó által befolyásolható bemenet, SOSEM redirectelhetünk vele
// közvetlenül külső/protokoll-relatív célra.
//
// Csak "/"-lel kezdődő, KIZÁRÓLAG relatív útvonalakat fogadunk el:
//   - "//evil.com"      -> elutasítva (protokoll-relatív, böngésző külső hostra menne)
//   - "https://evil.com" -> elutasítva (abszolút URL)
//   - "/vedett-utvonal/app" -> elfogadva
export function safeReturnPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  return value;
}
