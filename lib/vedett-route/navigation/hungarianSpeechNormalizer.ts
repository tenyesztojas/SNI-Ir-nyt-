/**
 * Magyar TTS-normalizálás a Védett Útvonal hangos navigációjához.
 *
 * Kizárólag a felolvasandó szöveget alakítja át.
 * A képernyőn megjelenő canonical navigációs instrukciót NEM módosítja.
 */

const HUNGARIAN_ORDINALS: Record<number, string> = {
  1: "egyes",
  2: "kettes",
  3: "hármas",
  4: "négyes",
  5: "ötös",
  6: "hatos",
  7: "hetes",
  8: "nyolcas",
  9: "kilences",
  10: "tízes",
  11: "tizenegyes",
  12: "tizenkettes",
  13: "tizenhármas",
  14: "tizennégyes",
  15: "tizenötös",
  16: "tizenhatos",
  17: "tizenhetes",
  18: "tizennyolcas",
  19: "tizenkilences",
  20: "húszas",
  30: "harmincas",
  40: "negyvenes",
  50: "ötvenes",
  60: "hatvanas",
  70: "hetvenes",
  80: "nyolcvanas",
  90: "kilencvenes",
  100: "százas",
};

// 21-99 KÉTTAGÚ SORSZÁMNÉV (production hiba, 2026-10-01) — KORLÁTOZOTT,
// NEM általános magyar számnév-motor: csak a HUNGARIAN_ORDINALS-ban még
// nem szereplő, kerek tízesek közé eső számokra (21-29, 31-39, ..., 91-99)
// ad össze egy tízes-tövet (lásd TENS_STEM) ÉS a HUNGARIAN_ORDINALS-ban már
// meglévő egyes-szóalakot. A 20-as tízesnek magyar nyelvi kötőhangja van
// ("huszon" + "egyes" = "huszonegyes", SOHA "húszegyes") — ezt a TENS_STEM
// "huszon" bejegyzése kezeli, a 30-90 közötti tízesek pedig közvetlenül
// összefűzhetők ("ötven" + "hatos" = "ötvenhatos").
const TENS_STEM: Record<number, string> = {
  20: "huszon",
  30: "harminc",
  40: "negyven",
  50: "ötven",
  60: "hatvan",
  70: "hetven",
  80: "nyolcvan",
  90: "kilencven",
};

function routeNumberToHungarian(value: string): string {
  const number = Number(value);

  if (HUNGARIAN_ORDINALS[number]) {
    return HUNGARIAN_ORDINALS[number];
  }

  const tens = Math.floor(number / 10) * 10;
  const ones = number % 10;
  if (number > 20 && number < 100 && ones > 0 && TENS_STEM[tens] && HUNGARIAN_ORDINALS[ones]) {
    return `${TENS_STEM[tens]}${HUNGARIAN_ORDINALS[ones]}`;
  }

  return value;
}

/**
 * A canonical navigációs szövegből természetesebben felolvasható
 * magyar szöveget készít.
 */
export function normalizeHungarianTransitSpeech(text: string): string {
  let result = text;

  // MEGÁLLÓNÉV-VÉGI "M"/"M+H" JELZÉS (production hiba, 2026-10-01) — CSAK
  // megállónév/destination kontextusban (a szó végén, mielőtt a szöveg
  // véget ér, mondatvégi írásjel jön, vagy a MEGLÉVŐ "felé" szó követi),
  // SOHA globális "M" betűcsere (lásd a hibajegy explicit tiltását: más
  // szövegben, pl. egy méter-rövidítésben, hibát okozna). A bare "M" minta
  // ezért case-sensitive (kizárólag nagy "M"), hogy a "140 m"
  // távolság-rövidítéssel SOSE keveredjen. Előbb az "M+H" kombinált
  // jelzést cseréljük (specifikusabb minta), utána a bare "M"-et.
  //
  // FONTOS (regex-csapda): a "felé" szó UTÁNI \b NEM használható — a JS
  // \b KIZÁRÓLAG ASCII \w karaktereket tekint "szó" karakternek, az "é"
  // (nem-ASCII) NEM az, tehát "felé" végén SOSE jön létre \b-határ, és egy
  // `felé\b` minta SOHA nem illeszkedne. Helyette egy explicit negatív
  // lookahead zárja ki, hogy "felé" után még betű/szám következzen (pl.
  // "feléd").
  result = result.replace(/\bM\s*\+\s*H\b/gi, "metró- és HÉV-állomás");
  result = result.replace(/\bM\b(?=\s+felé(?![a-zA-Z0-9])|[.,]|$)/g, "metróállomás");

  // Metró: M2 -> "em kettes metró".
  result = result.replace(/\bM([1-4])\b/gi, (_, number: string) => {
    return `em ${routeNumberToHungarian(number)} metró`;
  });

  // HÉV: H5 -> "há ötös HÉV".
  result = result.replace(/\bH(\d+)\b/gi, (_, number: string) => {
    return `há ${routeNumberToHungarian(number)} HÉV`;
  });

  // "Busz 80" -> "nyolcvanas busz".
  result = result.replace(/\bBusz\s+(\d+)\b/gi, (_, number: string) => {
    return `${routeNumberToHungarian(number)} busz`;
  });

  // "80-as busz" / "80 busz" -> "nyolcvanas busz".
  result = result.replace(/\b(\d+)(?:-as|-es|-os|-ös)?\s+busz\b/gi, (_, number: string) => {
    return `${routeNumberToHungarian(number)} busz`;
  });

  // BETŰJELZÉSES JÁRAT + JÁRMŰTÍPUS (production hiba, 2026-10-01) — "56A
  // villamos" -> "ötvenhatos A villamos". Ezt a mintát a MEGLÉVŐ "{szám}
  // busz" szabály (fent) nem fedi: ott a számjegyek után KÖZVETLENÜL
  // whitespace kell, itt viszont egy betű (A/B/...) következik közvetlenül
  // a számjegyek után, whitespace NÉLKÜL — ezért külön, pontosan ILYEN
  // alakra illeszkedő szabály kell, nem a meglévő busz-szabály bővítése.
  result = result.replace(/\b(\d+)([A-Za-z])\s+(busz|villamos)\b/gi, (_, number: string, letter: string, vehicle: string) => {
    return `${routeNumberToHungarian(number)} ${letter.toUpperCase()} ${vehicle.toLowerCase()}`;
  });

  // 4-6-os villamos -> "négyes-hatos villamos".
  result = result.replace(
    /\b(\d+)-(\d+)(?:-os|-es|-as|-ös)?\s+villamos\b/gi,
    (_, first: string, second: string) =>
      `${routeNumberToHungarian(first)}-${routeNumberToHungarian(second)} villamos`
  );

  return result;
}
