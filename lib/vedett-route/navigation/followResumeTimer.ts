// TRANSIT GPS LOSS + CAMERA FOLLOW FIX SPRINT (2026-09-21) — a "user camera
// override" mostantól IDEIGLENES (4000 ms), nem tartós. EZ A MODUL NEM egy
// második kamera-állapotgép: a MEGLÉVŐ mechanizmus (VedettUtvonalMap.tsx
// userCameraOverrideRef-je, ami KIZÁRÓLAG a followMode:true váltásra oldódik
// fel — lásd annak fejlécét, VÁLTOZATLAN) továbbra is a kamera egyetlen
// tulajdonosa. Ez a kis, keretrendszer-független (nem React-specifikus)
// kontroller KIZÁRÓLAG azt dönti el, MIKOR hívja meg a hívó (itt:
// VedettUtvonalSearchForm.tsx) újra a MEGLÉVŐ setFollowMode(true)-t egy
// valódi felhasználói gesztus UTÁN — hogy ez node:test mock.timers-szel,
// jsdom NÉLKÜL, valódi viselkedés-tesztekkel fedhető legyen.

export const FOLLOW_RESUME_DELAY_MS = 4_000;

export interface FollowResumeTimerController {
  /**
   * Valódi felhasználói gesztus (drag/zoom/rotate/pitch) — (újra)indítja a
   * timert. Ha közben új gesztus érkezik, a KORÁBBI timer törlődik és egy
   * ÚJ, teljes `delayMs`-es timer indul ("restart 4000 ms").
   */
  onUserGesture(): void;
  /**
   * A timer törlése az `onResume` meghívása NÉLKÜL — explicit recenter
   * ("Kövesd a helyzetem"), navigáció vége, vagy unmount esetén.
   */
  cancel(): void;
}

/**
 * `onResume` a hívó MEGLÉVŐ "follow mode vissza" akcióját kapja (a hívóban
 * ez `() => setFollowMode(true)`) — ez a modul nem tudja és nem is kell,
 * hogy tudja, mi történik a follow-mode visszaállásakor.
 */
export function createFollowResumeTimer(
  onResume: () => void,
  delayMs: number = FOLLOW_RESUME_DELAY_MS,
): FollowResumeTimerController {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return {
    onUserGesture() {
      clear();
      timeoutId = setTimeout(() => {
        timeoutId = null;
        onResume();
      }, delayMs);
    },
    cancel() {
      clear();
    },
  };
}
