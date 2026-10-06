"use client";

// VÉDETT ÚTVONAL — COMMUNITY REPORTS v1 (2026-10-06) — "Jelzés" gomb + kompakt
// bottom sheet az aktív navigációban. Egy érintés = egy report. Nem blokkolja
// a navigációt: a panel nem modális (nincs háttér-overlay), bármikor bezárható,
// a navigáció/GPS/TTS állapotához nem nyúl. Csak a már ismert közlekedési
// kontextust küldi (lásd buildCommunityReportContext) — koordinátát soha.

import { useEffect, useRef, useState } from "react";
import {
  COMMUNITY_REPORT_DEFINITIONS,
  COMMUNITY_REPORT_UI_GROUPS,
  type CommunityReportType,
} from "@/lib/vedett-route/communityReports/config";
import type { CommunityReportTransitContext } from "@/lib/vedett-route/communityReports/context";

type SubmitState = "idle" | "sending" | "thanks" | "error";

// A panel nyitott állapota a szülőé (open/onOpenChange), hogy a szülő a
// lebegő pihenő-gombokat elrejthesse, amíg a panel nyitva van.
export default function CommunityReportButton({
  context,
  open,
  onOpenChange: setOpen,
}: {
  context: CommunityReportTransitContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<SubmitState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Unmountkor (pl. navigáció vége) a panel zárt állapotba kerül.
  useEffect(() => () => setOpen(false), [setOpen]);

  const flash = (next: SubmitState) => {
    setState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 2500);
  };

  const submit = async (reportType: CommunityReportType) => {
    if (state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/vedett-route/community-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, context }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (response.ok && data?.ok) {
        setOpen(false);
        flash("thanks");
      } else {
        flash("error");
      }
    } catch {
      flash("error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="vedett-community-report-sheet"
        className="btn-secondary bg-white text-xs shadow"
      >
        📣 Jelzés
      </button>

      {(state === "thanks" || state === "error") && (
        <span role="status" aria-live="polite" className={`rounded bg-white/95 px-2 py-1 text-xs shadow ${state === "thanks" ? "text-emerald-700" : "text-amber-700"}`}>
          {state === "thanks" ? "Köszönjük a jelzést!" : "A jelzést most nem sikerült elküldeni."}
        </span>
      )}

      {open && (
        <div
          id="vedett-community-report-sheet"
          role="dialog"
          aria-modal="false"
          aria-label="Jelzés küldése"
          className="fixed inset-x-2 bottom-2 z-[1100] mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Mit tapasztalsz?</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Jelzés panel bezárása" className="rounded-full px-2 py-1 text-sm text-gray-500">
              ✕
            </button>
          </div>
          {COMMUNITY_REPORT_UI_GROUPS.map((group) => (
            <div key={group.category} className="mb-2 last:mb-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{group.title}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {group.types.map((type) => {
                  const definition = COMMUNITY_REPORT_DEFINITIONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={state === "sending"}
                      onClick={() => submit(type)}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-medium text-gray-800 active:bg-gray-100 disabled:opacity-60"
                    >
                      <span aria-hidden="true" className="text-base">{definition.emoji}</span>
                      {definition.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
