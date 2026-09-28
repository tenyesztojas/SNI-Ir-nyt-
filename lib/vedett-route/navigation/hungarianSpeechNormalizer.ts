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

function routeNumberToHungarian(value: string): string {
  const number = Number(value);

  if (HUNGARIAN_ORDINALS[number]) {
    return HUNGARIAN_ORDINALS[number];
  }

  return value;
}

/**
 * A canonical navigációs szövegből természetesebben felolvasható
 * magyar szöveget készít.
 */
export function normalizeHungarianTransitSpeech(text: string): string {
  let result = text;

  // BKK / budapesti helynevekben használt kombinált módjelölések.
  result = result.replace(/\bM\s*\+\s*H\b/gi, "metró és HÉV");

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

  // 4-6-os villamos -> "négyes-hatos villamos".
  result = result.replace(
    /\b(\d+)-(\d+)(?:-os|-es|-as|-ös)?\s+villamos\b/gi,
    (_, first: string, second: string) =>
      `${routeNumberToHungarian(first)}-${routeNumberToHungarian(second)} villamos`
  );

  return result;
}
