"use client";

import { useEffect, useRef, useState } from "react";
import { useAccessibility } from "./AccessibilityProvider";

// Wheelchair SVG ikon (WCAG-barát, nem dekoratív)
function WheelchairIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="h-5 w-5"
    >
      {/* Fej */}
      <circle cx="12" cy="4" r="2" />
      {/* Test és kerekes szék */}
      <path d="M10 7h4l1.5 5H17a1 1 0 0 1 0 2h-2.5l-.5-1.5-1 3.5H17v4h-2v-3H9.5L8 12.5V8.5L6 9V7h4zm-1 9.5A2.5 2.5 0 1 0 11.5 19 2.5 2.5 0 0 0 9 16.5z" />
    </svg>
  );
}

// Toggle kapcsoló komponens
function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal focus-visible:ring-offset-1 ${
        checked
          ? "border-sni-brand-teal bg-sni-brand-teal"
          : "border-gray-300 bg-gray-200"
      }`}
      aria-label={`${label}: ${checked ? "bekapcsolva" : "kikapcsolva"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// Egy beállítási sor
function SettingRow({
  icon,
  label,
  description,
  checked,
  onToggle,
  id,
}: {
  icon: string;
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  id: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <label htmlFor={id} className="flex flex-1 cursor-pointer items-start gap-2.5 min-w-0">
        <span className="text-base shrink-0" aria-hidden="true">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-800 leading-tight">{label}</span>
          {description && (
            <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
          )}
        </span>
      </label>
      <Toggle checked={checked} onChange={onToggle} label={label} id={id} />
    </div>
  );
}

export default function AccessibilityButton() {
  const {
    prefs,
    increaseFontScale,
    decreaseFontScale,
    toggleGrayscale,
    setContrast,
    toggleUnderlineLinks,
    toggleReadableFont,
    reset,
  } = useAccessibility();

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = "a11y-panel";

  // Escape bezárás
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Kívülre kattintás bezár
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Megnyitáskor fókusz a panelre
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const first = panelRef.current?.querySelector<HTMLElement>(
          "button, [role='switch'], [tabindex='0']"
        );
        first?.focus();
      }, 50);
    }
  }, [open]);

  const isModified =
    prefs.fontScale !== 100 ||
    prefs.grayscale ||
    prefs.contrast !== "none" ||
    prefs.underlineLinks ||
    prefs.readableFont;

  return (
    <div className="relative">
      {/* Sárga akadálymentességi gomb */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Akadálymentességi beállítások"
        title="Akadálymentesség"
        className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-black shadow-md transition-all hover:bg-yellow-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2 active:scale-95"
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <WheelchairIcon />
        {/* Aktív állapot jelző pont */}
        {isModified && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-sni-brand-teal"
          />
        )}
        {/* Tooltip — csak desktop */}
        <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 hidden sm:block">
          Akadálymentesség
        </span>
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Mobil backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 sm:hidden"
            aria-hidden="true"
          />

          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Akadálymentességi beállítások"
            aria-modal="true"
            className={`
              fixed z-50
              /* Mobil: bottom sheet */
              bottom-0 left-0 right-0 rounded-t-3xl
              /* Desktop: floating panel a gomb alatt */
              sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:rounded-2xl sm:w-80
              bg-white shadow-2xl border border-gray-100
              max-h-[85vh] overflow-y-auto
            `}
          >
            {/* Panel fejléc */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-black">
                  <WheelchairIcon />
                </span>
                <h2 className="text-base font-bold text-gray-900">Akadálymentesség</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Panel bezárása"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 pb-5">
              {/* Betűméret */}
              <div className="border-b border-gray-100 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Betűméret
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={decreaseFontScale}
                    disabled={prefs.fontScale <= 90}
                    aria-label="Betűméret csökkentése"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-lg font-bold text-gray-700 transition hover:border-sni-brand-teal hover:text-sni-brand-teal disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
                  >
                    A−
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-sm font-semibold text-gray-800">
                      {prefs.fontScale}%
                    </span>
                    <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-sni-brand-teal transition-all"
                        style={{ width: `${((prefs.fontScale - 90) / 60) * 100}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <button
                    onClick={increaseFontScale}
                    disabled={prefs.fontScale >= 150}
                    aria-label="Betűméret növelése"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-lg font-bold text-gray-700 transition hover:border-sni-brand-teal hover:text-sni-brand-teal disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
                  >
                    A+
                  </button>
                </div>
              </div>

              {/* Vizuális módok */}
              <div className="border-b border-gray-100 py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Vizuális mód
                </p>
                <p className="mb-2 text-[11px] text-gray-400">Egyszerre csak egy aktív</p>
                <div className="space-y-1 divide-y divide-gray-50">
                  <SettingRow
                    icon="◑"
                    id="a11y-high-contrast"
                    label="Magas kontraszt"
                    checked={prefs.contrast === "high"}
                    onToggle={() => setContrast("high")}
                  />
                  <SettingRow
                    icon="◐"
                    id="a11y-negative-contrast"
                    label="Negatív kontraszt"
                    description="Sötét háttér, világos szöveg"
                    checked={prefs.contrast === "negative"}
                    onToggle={() => setContrast("negative")}
                  />
                  <SettingRow
                    icon="☀"
                    id="a11y-light-bg"
                    label="Világos háttér"
                    description="Minimális vizuális zaj"
                    checked={prefs.contrast === "light"}
                    onToggle={() => setContrast("light")}
                  />
                </div>
              </div>

              {/* Egyéb */}
              <div className="py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Egyéb beállítások
                </p>
                <div className="space-y-1 divide-y divide-gray-50">
                  <SettingRow
                    icon="◫"
                    id="a11y-grayscale"
                    label="Szürkeárnyalat"
                    checked={prefs.grayscale}
                    onToggle={toggleGrayscale}
                  />
                  <SettingRow
                    icon="🔗"
                    id="a11y-underline"
                    label="Linkek aláhúzása"
                    checked={prefs.underlineLinks}
                    onToggle={toggleUnderlineLinks}
                  />
                  <SettingRow
                    icon="A"
                    id="a11y-readable-font"
                    label="Olvasható betűtípus"
                    description="Jól elkülöníthető karakterek"
                    checked={prefs.readableFont}
                    onToggle={toggleReadableFont}
                  />
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={reset}
                disabled={!isModified}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition hover:border-red-300 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sni-brand-teal"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
                Alaphelyzetbe állítás
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
