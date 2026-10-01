"use client";

import { useState } from "react";
import ScheduleItemForm from "@/components/family/ScheduleItemForm";
import DeleteScheduleItemButton from "@/components/family/DeleteScheduleItemButton";
import type { ChildScheduleItemView, FamilyChildView } from "@/lib/family/data";

// Napirend — Család -> Gyermek -> Napirend -> Napirendi elemek
// hierarchia legalsó szintje. A gyermek nevét MINDIG kiírja a fejlécben
// (lásd a feladat "melyik gyermek napirendje" követelményét), így
// több gyermek esetén sem félreérthető.
const WEEKDAY_LABELS: Record<number, string> = {
  1: "H",
  2: "K",
  3: "Sze",
  4: "Cs",
  5: "P",
  6: "Szo",
  7: "V",
};

function formatScheduleSummary(item: ChildScheduleItemView): string {
  if (item.scheduleType === "recurring") {
    const days = (item.daysOfWeek ?? [])
      .map((d) => WEEKDAY_LABELS[d] ?? String(d))
      .join(", ");
    return `Ismétlődő — ${days}`;
  }
  return item.startDate ? `Egyszeri — ${item.startDate}` : "Egyszeri";
}

export default function ChildScheduleSection({
  child,
  canManage,
}: {
  child: FamilyChildView;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // "none" = nincs nyitott form; "create" = új elem form; egyébként a
  // szerkesztett napirendi elem id-ja.
  const [formMode, setFormMode] = useState<string>("none");

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="btn-secondary mt-3 w-fit min-h-[44px] text-sm"
      >
        Napirend megtekintése — {child.firstName}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-700">
          Napirend — {child.firstName}
        </h4>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setFormMode("none");
          }}
          className="text-xs text-gray-500 underline"
        >
          Elrejtés
        </button>
      </div>

      {child.scheduleItems.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          Még nincs napirendi elem.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {child.scheduleItems.map((item) =>
            formMode === item.id ? (
              <li key={item.id}>
                <ScheduleItemForm
                  childId={child.id}
                  item={item}
                  onDone={() => setFormMode("none")}
                />
              </li>
            ) : (
              <li
                key={item.id}
                className="rounded-xl border border-gray-200 p-3 text-sm text-gray-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <p className="text-gray-500">
                      {formatScheduleSummary(item)}
                    </p>
                    <p className="text-gray-500">
                      Indulás: {item.timeLocal}
                      {item.arrivalTimeLocal
                        ? ` · Érkezés: ${item.arrivalTimeLocal}`
                        : ""}
                    </p>
                    {(item.originLabel || item.destinationLabel) && (
                      <p className="text-gray-500">
                        {item.originLabel ?? "?"} → {item.destinationLabel ?? "?"}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => setFormMode(item.id)}
                        className="btn-secondary min-h-[44px] text-sm"
                      >
                        Szerkesztés
                      </button>
                      <DeleteScheduleItemButton itemId={item.id} />
                    </div>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {canManage &&
        (formMode === "create" ? (
          <ScheduleItemForm
            childId={child.id}
            onDone={() => setFormMode("none")}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFormMode("create")}
            className="btn-secondary mt-3 min-h-[44px] text-sm"
          >
            Napirendi elem hozzáadása
          </button>
        ))}
    </div>
  );
}
