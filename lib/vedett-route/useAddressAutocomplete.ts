"use client";

// CÍM AUTOCOMPLETE — KÖZÖS hook (2026-09-14, "cím-bevitel UX" sprint,
// kiterjesztve a transit Honnan?/Hová? mezőkre is; 2026-09-14 "Mapbox
// Search Box autocomplete" sprint — a szerver oldali provider Nominatimról
// Mapbox Search Box-ra váltott, ez a hook maga NEM hívja a Nominatimot/
// Mapboxot közvetlenül). Eredetileg a VedettUtvonalWorkspace.tsx (autós
// Honnan?/Hová?) tartalmazta — ide emelve, hogy a VedettUtvonalSearchForm.tsx
// (transit "Cím vagy hely" mezők) is UGYANEZT használhassa, duplikáció
// nélkül.
//
// A hook a MEGLÉVŐ /api/admin/vedett-utvonal/address-search végpontot hívja
// (ami most a Mapbox Search Box /suggest-et használja a szerveroldalon) —
// NEM egy második autocomplete/geocoding rendszer. Minimum 3 karakter,
// 300ms debounce, legfeljebb 5 javaslat (a szerver oldal vágja).
//
// SESSION TOKEN (2026-09-14, Mapbox Search Box sprint) — a Search Box API
// session-alapú: egy autocomplete-interakción (egymást követő /suggest
// hívásokon) belül UGYANAZT a tokent kell használni, majd a kiválasztott
// javaslat /retrieve hívásakor is ezt. A hook egy stabil session tokent
// tart (React state-ben, NEM generál újat minden billentyűleütésre) — új
// session a hívó által, a `resetSession()` (a hook 4. visszatérési
// eleme) hívásával indítható (pl. suggestion kiválasztása után, vagy egy
// új keresési folyamat kezdetén).

import { useCallback, useEffect, useState } from "react";

export type AddressSuggestion = {
  id?: string;
  label: string;
  lat?: number;
  lon?: number;
  name?: string;
  city?: string;
  postcode?: string;
  district?: string;
  sessionToken?: string;
};

export const ADDRESS_AUTOCOMPLETE_MIN_CHARS = 3;
export const ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 300;

// EXPLICIT VÁROS/KERÜLET (2026-09-14, "transit külön Város mező" hardening)
// — opcionális, a hívó adja át, ha van KÜLÖN Város/Irányítószám-vagy-kerület
// mezője (a transit "Cím vagy hely" mező mellett, lásd
// VedettUtvonalSearchForm.tsx). Az autós ág (VedettUtvonalWorkspace.tsx)
// ezt nem adja át (nincs külön Város mezője) — ott VÁLTOZATLAN a régi,
// csak-query viselkedés.
export interface UseAddressAutocompleteOptions {
  city?: string;
  postalOrDistrict?: string;
}

// Egyszerű UUID v4 generátor — a `crypto.randomUUID()` a MEGLÉVŐ, modern
// futásidőkben (Node 18+, minden mai böngésző) elérhető; a fallback csak
// egy elméleti, nagyon régi böngésző esetére van, NEM kriptográfiai célra
// (kizárólag a Mapbox session-elkülönítéshez kell egy egyedi szöveg).
function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useAddressAutocomplete(value: string, disabled: boolean, options: UseAddressAutocompleteOptions = {}) {
  const { city, postalOrDistrict } = options;
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  // Session token — EGYSZER generálódik (lazy init), és amíg a hívó nem
  // hív resetSession()-t, STABIL marad (nem billentyűleütésenként újul).
  const [sessionToken, setSessionToken] = useState<string>(() => generateSessionToken());
  const resetSession = useCallback(() => setSessionToken(generateSessionToken()), []);

  useEffect(() => {
    const query = value.trim();
    if (disabled || query.length < ADDRESS_AUTOCOMPLETE_MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch("/api/admin/vedett-utvonal/address-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, city, postalOrDistrict, sessionToken }),
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          // Hálózati hiba esetén az autocomplete csendben elnémul — a
          // kézi címbevitel és a routing ettől NEM romlik el.
          if (!cancelled) setSuggestions([]);
        });
    }, ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // A sessionToken VÁLTOZÁSA (resetSession() hívás után) szándékosan új
    // keresést indít — de a sessionToken maga NEM változik keystroke-onként,
    // úgyhogy ez nem okoz extra hívást a normál gépelés közben.
  }, [value, disabled, city, postalOrDistrict, sessionToken]);

  return [suggestions, setSuggestions, sessionToken, resetSession] as const;
}

// RETRIEVE (2026-09-14, Mapbox Search Box sprint) — egy KIVÁLASZTOTT
// javaslat pontos koordinátáját kéri le a MEGLÉVŐ (kis, önálló)
// /api/admin/vedett-utvonal/address-retrieve végponton, UGYANAZZAL a
// sessionTokennel, mint amivel a suggestion érkezett (Mapbox session
// API előírás). Hiba/timeout esetén `null` — a hívó fél (UI) ettől NEM
// törhet el.
export async function retrieveAddressSuggestion(
  id: string,
  sessionToken: string
): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const res = await fetch("/api/admin/vedett-utvonal/address-retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sessionToken }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    const record = data as { lat?: unknown; lon?: unknown; label?: unknown } | null;
    if (!record || typeof record.lat !== "number" || typeof record.lon !== "number") return null;
    return { lat: record.lat, lon: record.lon, label: typeof record.label === "string" ? record.label : "" };
  } catch {
    return null;
  }
}
