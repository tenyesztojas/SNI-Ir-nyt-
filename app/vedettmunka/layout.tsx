import type { ReactNode } from "react";

export const metadata = {
  title: { template: "%s – VédettMunka", default: "VédettMunka" },
  description:
    "Neurodivergens, megváltozott munkaképességű és érintett gyermeket nevelő szülők számára is befogadó álláshirdetések.",
};

export default function VedettMunkaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* VédettMunka sávos fejléc */}
      <div className="bg-sni-brand-navy py-2 text-center text-xs font-semibold tracking-wide text-sni-brand-teal">
        VédettMunka — neurodivergens és megváltozott munkaképességű álláskeresők számára is befogadó állások
      </div>
      {children}
    </div>
  );
}
