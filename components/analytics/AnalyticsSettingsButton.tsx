"use client";

// „Analitikai beállítások" – újranyitja a hozzájárulás-panelt, ahol a
// választás bármikor módosítható (engedélyezés / elutasítás, visszavonás).

import { ANALYTICS_CONSENT_OPEN_EVENT } from "@/lib/analytics/consent";

export default function AnalyticsSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(ANALYTICS_CONSENT_OPEN_EVENT))}
    >
      Analitikai beállítások
    </button>
  );
}
