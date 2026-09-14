"use client";

// CÍM AUTOCOMPLETE — KÖZÖS hook (2026-09-14, "cím-bevitel UX" sprint,
// kiterjesztve a transit Honnan?/Hová? mezőkre is). Eredetileg a
// VedettUtvonalWorkspace.tsx (autós Honnan?/Hová?) tartalmazta — ide
// emelve, hogy a VedettUtvonalSearchForm.tsx (transit "Cím vagy hely"
// mezők) is UGYANEZT használhassa, duplikáció nélkül.
//
// A hook a MEGLÉVŐ /api/admin/vedett-utvonal/address-search végpontot hívja
// (ami a MEGLÉVŐ geocoder searchPlaceCandidates()-ét használja) — NEM egy
// második autocomplete/geocoding rendszer. Minimum 3 karakter, 300ms
// debounce, legfeljebb 5 javaslat (a szerver oldal vágja).

import { useEffect, useState } from "react";

export type AddressSuggestion = { label: string; lat: number; lon: number };

export const ADDRESS_AUTOCOMPLETE_MIN_CHARS = 3;
export const ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 300;

export function useAddressAutocomplete(value: string, disabled: boolean) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);

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
        body: JSON.stringify({ q: query }),
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
  }, [value, disabled]);

  return [suggestions, setSuggestions] as const;
}
