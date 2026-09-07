"use client";

// GPS V1 — a böngésző Geolocation API-jának React hook wrappere.
//
// SZIGORÚ ADATVÉDELMI SZABÁLY (Map/GPS/Rest Points sprint, H/I. pont):
//  - a folyamatos GPS-koordinátát ez a hook NEM tárolja Supabase-ben,
//  - NEM logolja (sem console.log, sem vedettRouteLog),
//  - NEM készít location historyt vagy mozgásprofilt,
//  - a pozíció KIZÁRÓLAG a React state-ben él, csak az aktuális
//    böngésző-session alatt, memóriában — újratöltéskor elvész.
//  - Az egyetlen hely, ahol egy GPS-koordináta perzisztálódik, az a
//    felhasználó ÁLTAL EXPLICIT KEZDEMÉNYEZETT pihenőpont-mentés (lásd
//    RestPointQuickAdd.tsx) — az is csak azt az EGY pontot menti, amit a
//    user aktívan létrehozott, nem a folyamatos pozíciót.
//
// Csak explicit felhasználói engedély (böngésző saját permission promptja)
// után kér pozíciót — nincs automatikus/rejtett lekérdezés.

import { useCallback, useEffect, useRef, useState } from "react";

export type GeolocationStatus =
  | "idle" // még nem kérte a felhasználó
  | "requesting" // engedélykérés / első pozíció folyamatban
  | "granted" // van érvényes pozíció
  | "denied" // a felhasználó elutasította az engedélyt
  | "unavailable" // a böngésző/eszköz nem támogatja, vagy a pozíció nem elérhető
  | "timeout" // időtúllépés
  | "error"; // egyéb hiba

export interface GeolocationState {
  status: GeolocationStatus;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  errorMessage: string | null;
}

const INITIAL_STATE: GeolocationState = {
  status: "idle",
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  errorMessage: null,
};

function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function mapError(err: GeolocationPositionError): GeolocationState {
  // A böngésző GeolocationPositionError kódjai: 1=PERMISSION_DENIED,
  // 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
  if (err.code === err.PERMISSION_DENIED) {
    return { ...INITIAL_STATE, status: "denied", errorMessage: "A helymeghatározás engedélye el lett utasítva." };
  }
  if (err.code === err.TIMEOUT) {
    return { ...INITIAL_STATE, status: "timeout", errorMessage: "A helymeghatározás túl sokáig tartott." };
  }
  return { ...INITIAL_STATE, status: "unavailable", errorMessage: "A jelenlegi hely nem határozható meg (pl. asztali gépen GPS nélkül, vagy gyenge jel)." };
}

export interface UseGeolocationResult extends GeolocationState {
  /** Egyszeri pozíció lekérése (böngésző engedélykérést indíthat). */
  requestOnce: () => void;
  /** Folyamatos pozíciókövetés indítása (böngésző engedélykérést indíthat). */
  startWatching: () => void;
  /** Folyamatos pozíciókövetés leállítása — a state-ben lévő utolsó pozíció megmarad, amíg az oldal él, de semmi nem lett perzisztálva. */
  stopWatching: () => void;
  isWatching: boolean;
}

export function useGeolocation(): UseGeolocationResult {
  const [state, setState] = useState<GeolocationState>(INITIAL_STATE);
  const watchIdRef = useRef<number | null>(null);
  const [isWatching, setIsWatching] = useState(false);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    setState({
      status: "granted",
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyMeters: pos.coords.accuracy,
      errorMessage: null,
    });
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    setState(mapError(err));
  }, []);

  const requestOnce = useCallback(() => {
    if (!isGeolocationSupported()) {
      setState({ ...INITIAL_STATE, status: "unavailable", errorMessage: "A böngésző nem támogatja a helymeghatározást." });
      return;
    }
    setState((s) => ({ ...s, status: "requesting", errorMessage: null }));
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    });
  }, [handleSuccess, handleError]);

  const startWatching = useCallback(() => {
    if (!isGeolocationSupported()) {
      setState({ ...INITIAL_STATE, status: "unavailable", errorMessage: "A böngésző nem támogatja a helymeghatározást." });
      return;
    }
    if (watchIdRef.current !== null) return; // már fut
    setState((s) => ({ ...s, status: "requesting", errorMessage: null }));
    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 5_000,
    });
    setIsWatching(true);
  }, [handleSuccess, handleError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && isGeolocationSupported()) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
  }, []);

  // Cleanup: az oldal elhagyásakor mindig leállítjuk a követést — nem
  // maradhat háttérben futó GPS-lekérdezés.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && isGeolocationSupported()) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { ...state, requestOnce, startWatching, stopWatching, isWatching };
}
