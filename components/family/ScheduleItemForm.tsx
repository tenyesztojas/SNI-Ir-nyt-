"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createChildScheduleItemAction,
  updateChildScheduleItemAction,
  FamilyActionState,
} from "@/lib/actions/family";
import type { ChildScheduleItemView, ScheduleType } from "@/lib/family/data";
import {
  retrieveAddressSuggestion,
  useAddressAutocomplete,
  type AddressSuggestion,
} from "@/lib/vedett-route/useAddressAutocomplete";
import { hasValidCoordinates } from "@/lib/family/scheduleLocation";
import type { SavedPlace } from "@/lib/vedett-route/savedPlaces/types";
import { savedPlaceToRouteLocation } from "@/lib/vedett-route/savedPlaces/adapt";

// A bejelentkezett felhasználó SAJÁT mentett helyei a MEGLÉVŐ
// /api/vedett-route/saved-places végpontról (session-alapú, felhasználónként
// elkülönített). Hiba / nincs jogosultság esetén üres lista, a választó
// rejtve marad. Nincs logolás (címek, koordináták).
function useOwnSavedPlaces(): SavedPlace[] {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/vedett-route/saved-places", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; places?: SavedPlace[] } | null) => {
        if (!cancelled && json?.ok && Array.isArray(json.places)) setPlaces(json.places);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return places;
}

// Helyszín mező a MEGLÉVŐ Védett Útvonal címkeresővel. Koordináta CSAK a
// javaslatok közül kiválasztott helyhez kerül a rejtett mezőkbe; kézi
// átírás törli, így szöveges címhez soha nincs kitalált koordináta.
function ScheduleLocationField({
  label,
  name,
  latName,
  lonName,
  initialLabel,
  initialLat,
  initialLon,
  savedPlaces,
}: {
  label: string;
  name: string;
  latName: string;
  lonName: string;
  initialLabel: string;
  initialLat: number | null;
  initialLon: number | null;
  savedPlaces: SavedPlace[];
}) {
  const [text, setText] = useState(initialLabel);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    hasValidCoordinates(initialLat, initialLon) ? { lat: initialLat as number, lon: initialLon as number } : null
  );
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions, sessionToken, resetSession] = useAddressAutocomplete(text, !focused || coords !== null);

  async function pick(s: AddressSuggestion) {
    setSuggestions([]);
    let picked: { lat: number; lon: number; label: string } | null =
      hasValidCoordinates(s.lat, s.lon) ? { lat: s.lat as number, lon: s.lon as number, label: s.label } : null;
    if (!picked && s.id) picked = await retrieveAddressSuggestion(s.id, s.sessionToken ?? sessionToken);
    resetSession();
    const finalLabel = (picked?.label || s.label).slice(0, 120);
    setText(finalLabel);
    setCoords(picked && hasValidCoordinates(picked.lat, picked.lon) ? { lat: picked.lat, lon: picked.lon } : null);
  }

  // Mentett hely: cím ÉS koordináta együtt kerül az eseménybe.
  function pickSaved(id: string) {
    const place = savedPlaces.find((p) => p.id === id);
    if (!place) return;
    const loc = savedPlaceToRouteLocation(place);
    if (!hasValidCoordinates(loc.latitude, loc.longitude)) return;
    setSuggestions([]);
    setText(loc.name.slice(0, 120));
    setCoords({ lat: loc.latitude, lon: loc.longitude });
  }

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      {savedPlaces.length > 0 && (
        <select
          aria-label={`${label} – mentett helyeim`}
          value=""
          onChange={(e) => pickSaved(e.target.value)}
          className="input-field mt-1 text-sm"
        >
          <option value="">Választás a mentett helyeim közül…</option>
          {savedPlaces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      )}
      <input
        name={name}
        maxLength={120}
        value={text}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setCoords(null);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        className="input-field mt-1"
      />
      <input type="hidden" name={latName} value={coords ? String(coords.lat) : ""} />
      <input type="hidden" name={lonName} value={coords ? String(coords.lon) : ""} />
      {focused && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id ?? `${s.label}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
                className="block min-h-[44px] w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-gray-500">
        {coords ? "Helyszín kiválasztva – útvonaltervezéshez használható." : "Válassz a javaslatok közül az útvonaltervezéshez."}
      </p>
    </div>
  );
}

// Egyetlen, create ÉS edit módban egyaránt használt napirendi-elem
// űrlap — nincs külön, párhuzamos edit-architektúra (lásd a feladat
// explicit kérését). `item` megléte dönti el a módot: ha nincs `item`,
// a create_child_schedule_item RPC-t hívó actiont használja, ha van,
// az update_child_schedule_item RPC-t hívót, előtöltött mezőkkel.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "H" },
  { value: 2, label: "K" },
  { value: 3, label: "Sze" },
  { value: 4, label: "Cs" },
  { value: 5, label: "P" },
  { value: 6, label: "Szo" },
  { value: 7, label: "V" },
];

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary min-h-[44px] text-sm"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function ScheduleItemForm({
  childId,
  item,
  onDone,
}: {
  childId: string;
  item?: ChildScheduleItemView;
  onDone: () => void;
}) {
  const isEdit = Boolean(item);
  const savedPlaces = useOwnSavedPlaces();
  const action = isEdit
    ? updateChildScheduleItemAction
    : createChildScheduleItemAction;
  const [state, formAction] = useFormState<FamilyActionState, FormData>(
    action,
    null
  );
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    item?.scheduleType ?? "one_time"
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    item?.daysOfWeek ?? []
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function toggleDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-gray-200 p-3"
    >
      <input type="hidden" name="childId" value={childId} />
      {isEdit && item && <input type="hidden" name="itemId" value={item.id} />}
      {isEdit && item && (
        <input
          type="hidden"
          name="isActive"
          value={item.isActive ? "true" : "false"}
        />
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Megnevezés *
        </label>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={item?.title}
          className="input-field mt-1"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Leírás (opcionális)
        </label>
        <input
          name="description"
          maxLength={300}
          defaultValue={item?.description ?? ""}
          className="input-field mt-1"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Típus *
        </label>
        <select
          name="scheduleType"
          required
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
          className="input-field mt-1"
        >
          <option value="one_time">Egyszeri</option>
          <option value="recurring">Ismétlődő</option>
        </select>
      </div>

      {scheduleType === "one_time" ? (
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Dátum *
          </label>
          <input
            name="startDate"
            type="date"
            required
            defaultValue={item?.startDate ?? ""}
            className="input-field mt-1"
          />
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Napok *
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className="flex items-center gap-1 text-xs text-gray-700"
              >
                <input
                  type="checkbox"
                  name="daysOfWeek"
                  value={day.value}
                  checked={selectedDays.includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                />
                {day.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Kezdési idő *
          </label>
          <input
            name="timeLocal"
            type="time"
            required
            defaultValue={item?.timeLocal ?? ""}
            className="input-field mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Érkezési célidő (opcionális)
          </label>
          <input
            name="arrivalTimeLocal"
            type="time"
            defaultValue={item?.arrivalTimeLocal ?? ""}
            className="input-field mt-1"
          />
        </div>
      </div>

      <ScheduleLocationField
        label="Honnan (opcionális)"
        name="originLabel"
        latName="originLat"
        lonName="originLon"
        initialLabel={item?.originLabel ?? ""}
        initialLat={item?.originLat ?? null}
        initialLon={item?.originLon ?? null}
        savedPlaces={savedPlaces}
      />

      <ScheduleLocationField
        label="Hova (opcionális)"
        name="destinationLabel"
        latName="destinationLat"
        lonName="destinationLon"
        initialLabel={item?.destinationLabel ?? ""}
        initialLat={item?.destinationLat ?? null}
        initialLon={item?.destinationLon ?? null}
        savedPlaces={savedPlaces}
      />

      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          label={isEdit ? "Mentés" : "Hozzáadás"}
          pendingLabel={isEdit ? "Mentés..." : "Hozzáadás..."}
        />
        <button
          type="button"
          onClick={onDone}
          className="btn-secondary min-h-[44px] text-sm"
        >
          Mégse
        </button>
      </div>
    </form>
  );
}
