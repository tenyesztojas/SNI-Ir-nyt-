"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createChildScheduleItemAction,
  updateChildScheduleItemAction,
  FamilyActionState,
} from "@/lib/actions/family";
import type { ChildScheduleItemView, ScheduleType } from "@/lib/family/data";

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

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Honnan (opcionális)
        </label>
        <input
          name="originLabel"
          maxLength={120}
          defaultValue={item?.originLabel ?? ""}
          className="input-field mt-1"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Hova (opcionális)
        </label>
        <input
          name="destinationLabel"
          maxLength={120}
          defaultValue={item?.destinationLabel ?? ""}
          className="input-field mt-1"
        />
      </div>

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
