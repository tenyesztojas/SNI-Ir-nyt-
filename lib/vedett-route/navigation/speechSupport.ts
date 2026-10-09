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
