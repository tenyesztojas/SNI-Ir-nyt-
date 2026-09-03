import type { ReactNode } from "react";

export const metadata = {
  title: { template: "%s – VédettKarrier", default: "VédettKarrier" },
  description:
    "Rugalmas munkák, megbízások és lehetőségek a VédettSarok közösségének. Otthonról végezhető, részmunkaidős, előre tervezhető lehetőségek.",
};

export default function VedettMunkaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-sni-brand-navy py-2 text-center text-xs font-semibold tracking-wide text-sni-brand-teal">
        VédettKarrier — rugalmas munkák és lehetőségek a VédettSarok közösségének
      </div>
      {children}
    </div>
  );
}
