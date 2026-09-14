"use client";

// SettlementAutocomplete — Védett Útvonal, "UX-fejlesztés, főoldali
// kiemelés és a Béta megjelölés eltávolítása" kör, A) rész.
//
// Újrafelhasználható, hozzáférhető ("valódi" ARIA combobox) magyar
// település-autocomplete mező. A Védett Útvonal keresőformjában (induló és
// célhely "Város" mezője) EGYETLEN közös komponens/logika hívja ezt — nincs
// duplikált keresési/billentyűzet-kezelési kód a két mező között (lásd
// VedettUtvonalSearchForm.tsx, updateOriginManualField/
// updateDestinationManualField hívói).
//
// FONTOS, MIT NEM CSINÁL ez a komponens:
// - NEM hív semmilyen hálózati API-t (Nominatim vagy más) — a keresés
//   TELJESEN lokális, a data/hungarian-settlements.json előre betöltött,
//   előre indexelt listáján fut (lásd lib/vedett-route/settlements.ts).
// - NEM végez koordináta-geokódolást — kizárólag a település NEVÉNEK
//   azonosítását/kitöltését segíti. A mögötte álló "Város" mezőérték
//   (value/onChange) pontosan úgy folytatja az útját a meglévő
//   strukturált cím -> geokódolás folyamatban, mint egy sima <input>
//   esetén — a szülő komponens state-je és validációja VÁLTOZATLAN.
//
// BLUR/KATTINTÁS RACE CONDITION (spec 12. pont): a találat-elemek
// onMouseDown handlere e.preventDefault()-öt hív, ami megakadályozza, hogy
// a böngésző alapértelmezett mousedown-fókuszváltása elvegye a fókuszt a
// beviteli mezőtől — így a mező onBlur handlere SOSEM fut le egy találatra
// kattintás közben (nincs szükség setTimeout-os "trükkre"), a tényleges
// kiválasztás pedig a rákövetkező onClick eseményben történik meg.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  searchHungarianSettlements,
  formatSettlementCountyLabel,
  type Settlement,
} from "@/lib/vedett-route/settlements.ts";
import { SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH } from "@/lib/vedett-route/settlementSearch.ts";

export interface SettlementAutocompleteProps {
  /** Látható <label> szöveg (pl. "Város"). */
  label: string;
  /** A mező jelenlegi (nyers, szabadszöveges) értéke — a szülő state-jéből jön. */
  value: string;
  /**
   * Minden gépelésre/kiválasztásra meghívódik az ÚJ szöveges értékkel — a
   * szülő ugyanúgy kezeli, mint egy sima <input onChange>-et (pl.
   * updateOriginManualField("city", value)).
   */
  onChange: (value: string) => void;
  /** Kiválasztáskor (kattintás vagy Enter) is meghívódik, a teljes találat-objektummal — opcionális. */
  onSelect?: (settlement: Settlement) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Egyedi id-prefix az esetlegesen több egyidejű autocomplete mezőhöz (ARIA id-k egyediségéhez). */
  id?: string;
}

export default function SettlementAutocomplete({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  id,
}: SettlementAutocompleteProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Settlement[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Kiválasztott állapot (spec 14. pont, ✓ jelzés) — kizárólag UI-jelzés,
  // NEM a geokódolás bemenete. Bármilyen (a felhasználó általi) gépelés
  // azonnal false-ra állítja (spec 11. pont — "utólagos szerkesztés törli
  // a kiválasztott állapotot").
  const [selected, setSelected] = useState(false);

  const queryTooShort = value.trim().length < SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH;

  function recomputeResults(query: string): Settlement[] {
    const next = searchHungarianSettlements(query);
    setResults(next);
    setHighlightedIndex(next.length > 0 ? 0 : -1);
    return next;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    setSelected(false);
    if (next.trim().length < SETTLEMENT_AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      setOpen(false);
      setResults([]);
      setHighlightedIndex(-1);
      return;
    }
    recomputeResults(next);
    setOpen(true);
  }

  function handleFocus() {
    if (!queryTooShort) {
      recomputeResults(value);
      setOpen(true);
    }
  }

  function handleSelect(settlement: Settlement) {
    onChange(settlement.name);
    onSelect?.(settlement);
    setSelected(true);
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleBlur() {
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        const next = recomputeResults(value);
        if (next.length > 0) setOpen(true);
        return;
      }
      setHighlightedIndex((i) => (results.length === 0 ? -1 : (i + 1) % results.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return;
      setHighlightedIndex((i) => (results.length === 0 ? -1 : (i - 1 + results.length) % results.length));
      return;
    }
    if (e.key === "Enter") {
      if (open && highlightedIndex >= 0 && results[highlightedIndex]) {
        e.preventDefault();
        handleSelect(results[highlightedIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
      }
      return;
    }
  }

  const activeOptionId =
    open && highlightedIndex >= 0 && results[highlightedIndex] ? `${inputId}-option-${highlightedIndex}` : undefined;
  const showNoResults = open && !queryTooShort && results.length === 0;
  const showListbox = open && results.length > 0;

  return (
    <div className="relative min-w-0">
      <label htmlFor={inputId} className="block text-xs text-gray-500">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="mt-0.5 w-full min-w-0 rounded border border-gray-300 px-2 py-1.5 pr-6 text-sm disabled:bg-gray-100"
        />
        {selected && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-sm font-bold text-sni-brand-teal"
          >
            ✓
          </span>
        )}
        {showListbox && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {results.map((s, idx) => {
              const optionId = `${inputId}-option-${idx}`;
              const countyLabel = formatSettlementCountyLabel(s.county);
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={s.name}
                  id={optionId}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(s)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    isHighlighted ? "bg-sni-brand-teal/10 text-sni-brand-navy" : "text-gray-700"
                  }`}
                >
                  <span className="block font-medium leading-tight">{s.name}</span>
                  {countyLabel && <span className="block text-[11px] leading-tight text-gray-400">{countyLabel}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {showNoResults && (
          <p
            role="status"
            className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 shadow-lg"
          >
            Nincs ilyen település a listában.
          </p>
        )}
      </div>
    </div>
  );
}
