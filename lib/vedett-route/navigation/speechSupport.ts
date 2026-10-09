// HANGOS NAVIGÁCIÓ — tényleges Web Speech API támogatás felismerése
// (2026-10-09). Pure, a window-szerű objektumot paraméterként kapja, így
// Node-ban tesztelhető. Csak akkor "támogatott", ha a speechSynthesis
// objektum létezik ÉS van speak/cancel függvénye, ÉS a
// SpeechSynthesisUtterance konstruktor elérhető. (Android WebView-ban ez
// jellemzően hiányzik — eszközteszt nélkül nem állítjuk, hogy működik.)

export interface SpeechCapableWindowLike {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
}

export function detectSpeechSynthesisSupport(win: SpeechCapableWindowLike | null | undefined): boolean {
  if (!win) return false;
  if (typeof win.SpeechSynthesisUtterance !== "function") return false;
  const synth = win.speechSynthesis as { speak?: unknown; cancel?: unknown } | null | undefined;
  if (!synth || typeof synth !== "object") return false;
  return typeof synth.speak === "function" && typeof synth.cancel === "function";
}

// ---------------------------------------------------------------------------
// MAGYAR HANG + BESZÉDHIBÁK (2026-10-09, dafc28d utóellenőrzés).
// A getVoices() a böngészők többségében ASZINKRON töltődik (az első hívás
// üres listát adhat, a `voiceschanged` esemény jelzi a betöltést). Amíg a
// lista nem "rendeződött", az állapot UNKNOWN — ilyenkor nem állítunk semmit.
// Ha nincs magyar hang, a felület NEM ígér magyar hangos navigációt; a
// beszéd ettől még a lang="hu-HU" beállítással próbálkozik (a korábbi,
// böngészőben működő viselkedés változatlan).

export interface SpeechVoiceLike {
  lang: string;
  name?: string;
  default?: boolean;
  localService?: boolean;
}

export type SpeechVoiceAvailability = "UNKNOWN" | "HUNGARIAN" | "NO_HUNGARIAN";

/** A hívó ennyi idő után tekinti véglegesnek a (még mindig üres) hanglistát. */
export const SPEECH_VOICES_SETTLE_TIMEOUT_MS = 3_000;

const normalizeLang = (lang: string) => lang.trim().replace("_", "-").toLowerCase();

/** Pontos hu-HU egyezés előnyben, utána bármely "hu" nyelvű hang; azon belül az alapértelmezett. */
export function selectHungarianVoice<T extends SpeechVoiceLike>(voices: readonly T[] | null | undefined): T | null {
  if (!voices || voices.length === 0) return null;
  const exact = voices.filter((v) => normalizeLang(v.lang ?? "") === "hu-hu");
  const prefix = voices.filter((v) => /^hu(-|$)/.test(normalizeLang(v.lang ?? "")));
  const pool = exact.length > 0 ? exact : prefix;
  if (pool.length === 0) return null;
  return pool.find((v) => v.default) ?? pool[0];
}

export function resolveSpeechVoiceAvailability(
  voices: readonly SpeechVoiceLike[] | null | undefined,
  settled: boolean,
): SpeechVoiceAvailability {
  if (selectHungarianVoice(voices)) return "HUNGARIAN";
  if ((!voices || voices.length === 0) && !settled) return "UNKNOWN";
  return "NO_HUNGARIAN";
}

export const SPEECH_NO_HUNGARIAN_VOICE_MESSAGE =
  "Magyar hang nem található ezen az eszközön, ezért a felolvasás nem biztos, hogy magyarul szól.";

/**
 * SpeechSynthesisErrorEvent.error -> felhasználói üzenet. A "canceled" és
 * "interrupted" a SAJÁT cancel()-ünk normál következménye (új utasítás,
 * leállítás) — ezekre null (nincs hibaüzenet).
 */
export function describeSpeechSynthesisError(errorCode: string | null | undefined): string | null {
  switch (errorCode) {
    case "canceled":
    case "interrupted":
      return null;
    case "language-unavailable":
    case "voice-unavailable":
      return "A hangos navigáció nem tud magyarul felolvasni ezen az eszközön.";
    case "not-allowed":
      return "A böngésző nem engedte a felolvasást. Koppints a képernyőre, majd próbáld újra.";
    case "audio-busy":
    case "audio-hardware":
      return "A hangkimenet most nem érhető el, ezért a hangos utasítás elmaradt.";
    case "network":
      return "A felolvasáshoz szükséges hálózati kapcsolat nem érhető el.";
    default:
      return "A hangos utasítást nem sikerült lejátszani. A képernyőn lévő utasítások továbbra is érvényesek.";
  }
}
