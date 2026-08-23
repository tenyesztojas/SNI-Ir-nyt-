"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// ── Típusok ──────────────────────────────────────────────────
export type ContrastMode = "none" | "high" | "negative" | "light";

export interface A11yPreferences {
  fontScale: number;       // 90 | 100 | 110 | 120 | 130 | 140 | 150
  grayscale: boolean;
  contrast: ContrastMode;  // egymást kizárók: high | negative | light
  underlineLinks: boolean;
  readableFont: boolean;
}

export const DEFAULT_PREFS: A11yPreferences = {
  fontScale: 100,
  grayscale: false,
  contrast: "none",
  underlineLinks: false,
  readableFont: false,
};

const STORAGE_KEY = "vs-a11y";
const FONT_STEPS = [90, 100, 110, 120, 130, 140, 150];

// ── Context ───────────────────────────────────────────────────
interface A11yCtx {
  prefs: A11yPreferences;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  toggleGrayscale: () => void;
  setContrast: (mode: ContrastMode) => void;
  toggleUnderlineLinks: () => void;
  toggleReadableFont: () => void;
  reset: () => void;
}

const AccessibilityContext = createContext<A11yCtx | null>(null);

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used inside AccessibilityProvider");
  return ctx;
}

// ── HTML attribútumok beállítása ──────────────────────────────
function applyToHtml(prefs: A11yPreferences) {
  const html = document.documentElement;

  // Font scale
  if (prefs.fontScale === 100) {
    html.removeAttribute("data-font-scale");
  } else {
    html.setAttribute("data-font-scale", String(prefs.fontScale));
  }

  // Grayscale
  if (prefs.grayscale) html.setAttribute("data-grayscale", "1");
  else html.removeAttribute("data-grayscale");

  // Contrast
  if (prefs.contrast === "none") html.removeAttribute("data-contrast");
  else html.setAttribute("data-contrast", prefs.contrast);

  // Underline links
  if (prefs.underlineLinks) html.setAttribute("data-underline-links", "1");
  else html.removeAttribute("data-underline-links");

  // Readable font
  if (prefs.readableFont) html.setAttribute("data-readable-font", "1");
  else html.removeAttribute("data-readable-font");
}

// ── localStorage ──────────────────────────────────────────────
function loadPrefs(): A11yPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: A11yPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // localStorage nem elérhető — silent fail
  }
}

// ── Provider ──────────────────────────────────────────────────
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPreferences>(DEFAULT_PREFS);
  const [mounted, setMounted] = useState(false);

  // Hydration után localStorage olvasása és alkalmazása
  useEffect(() => {
    const stored = loadPrefs();
    setPrefs(stored);
    applyToHtml(stored);
    setMounted(true);
  }, []);

  // Minden prefs változáskor alkalmaz + ment
  const update = useCallback((patch: Partial<A11yPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      applyToHtml(next);
      savePrefs(next);
      return next;
    });
  }, []);

  const increaseFontScale = useCallback(() => {
    setPrefs((prev) => {
      const idx = FONT_STEPS.indexOf(prev.fontScale);
      const next = { ...prev, fontScale: FONT_STEPS[Math.min(idx + 1, FONT_STEPS.length - 1)] };
      applyToHtml(next);
      savePrefs(next);
      return next;
    });
  }, []);

  const decreaseFontScale = useCallback(() => {
    setPrefs((prev) => {
      const idx = FONT_STEPS.indexOf(prev.fontScale);
      const next = { ...prev, fontScale: FONT_STEPS[Math.max(idx - 1, 0)] };
      applyToHtml(next);
      savePrefs(next);
      return next;
    });
  }, []);

  const toggleGrayscale = useCallback(() =>
    update({ grayscale: !prefs.grayscale }), [prefs.grayscale, update]);

  const setContrast = useCallback((mode: ContrastMode) =>
    update({ contrast: prefs.contrast === mode ? "none" : mode }), [prefs.contrast, update]);

  const toggleUnderlineLinks = useCallback(() =>
    update({ underlineLinks: !prefs.underlineLinks }), [prefs.underlineLinks, update]);

  const toggleReadableFont = useCallback(() =>
    update({ readableFont: !prefs.readableFont }), [prefs.readableFont, update]);

  const reset = useCallback(() => {
    applyToHtml(DEFAULT_PREFS);
    savePrefs(DEFAULT_PREFS);
    setPrefs(DEFAULT_PREFS);
  }, []);

  return (
    <AccessibilityContext.Provider
      value={{
        prefs,
        increaseFontScale,
        decreaseFontScale,
        toggleGrayscale,
        setContrast,
        toggleUnderlineLinks,
        toggleReadableFont,
        reset,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}
