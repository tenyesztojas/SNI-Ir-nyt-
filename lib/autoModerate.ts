// lib/autoModerate.ts
// Automatikus technikai ellenőrző logika az ÁSZF 3. pontja alapján.
// FONTOS: Ez a modul SOHA nem vizsgálja a tartalom pozitív/negatív hangvételét
// (sentiment). Kizárólag formai, technikai és jogszabályi tilalmak alapján dönt.

export type ModResult =
  | { pass: true; flagged: false }
  | { pass: true; flagged: true; flagReason: string }
  | { pass: false; reason: string };

// Tiltott szavak/kifejezések listája — kizárólag jogszabályi tilalmak alapján
// (gyűlöletbeszéd, súlyos sértés). NEM tartalmaz hangvétel-alapú szűrést.
const BANNED_PATTERNS: RegExp[] = [
  /kurv[aá]/i,
  /fasz[oö]m/i,
  /bazd\s?meg/i,
  /basz[dm]/i,
  /pics[aá]/i,
  /gec[ií]/i,
  /büd[oö]s\s+(?:zsid[oó]|cigány|n[eé]ger)/i, // faji gyűlöletbeszéd
  /(?:zsid[oó]|cigány|n[eé]ger|feketé)\s+(?:takarodj|pusztulj|döglj)/i,
  /halj\s+meg/i,
  /(?:basz|kurv)\w{0,4}/i,
];

// Spam-mintázatok — gyanús, de NEM blokkolnak, csak flagelnek
const SPAM_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(.){9,}/, reason: "Ismétlődő karakterek" },
  { re: /(https?:\/\/\S+\s*){3,}/, reason: "Több külső link" },
  { re: /(?:klikk|click|casino|fogad[oó]iroda|bet\d{2,})/i, reason: "Spam kulcsszó" },
];

/**
 * Szöveges tartalom automatikus technikai ellenőrzése.
 * Bináris és determinisztikus: pass=true → közzétehető; pass=false → elutasítva.
 * A döntés soha nem alapul a tartalom pozitív/negatív hangvételén.
 */
export function autoModerateText(text: string): ModResult {
  if (!text || text.trim().length === 0) {
    return { pass: false, reason: "A szöveg nem lehet üres." };
  }

  // 1. Tiltott kifejezések ellenőrzése
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        pass: false,
        reason: "A szöveg jogszabályba ütköző kifejezést tartalmaz. Kérjük, fogalmazd meg másképp a tapasztalatod.",
      };
    }
  }

  // 2. Spam-mintázatok — flagelés, de nem blokkolás
  for (const { re, reason } of SPAM_PATTERNS) {
    if (re.test(text)) {
      return { pass: true, flagged: true, flagReason: reason };
    }
  }

  return { pass: true, flagged: false };
}

/**
 * Értékelés összes szöveges mezőjének ellenőrzése.
 */
export function autoModerateReview(fields: {
  title: string;
  positiveText: string;
  warningText?: string | null;
}): ModResult {
  const combined = [fields.title, fields.positiveText, fields.warningText ?? ""].join(" ");
  return autoModerateText(combined);
}

/**
 * Hely-javaslat szöveges mezőinek ellenőrzése.
 */
export function autoModeratePlace(fields: {
  name: string;
  description: string;
  whyFriendly: string;
}): ModResult {
  const combined = [fields.name, fields.description, fields.whyFriendly].join(" ");
  return autoModerateText(combined);
}
