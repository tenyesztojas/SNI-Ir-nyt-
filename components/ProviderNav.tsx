"use client";
import Link from "next/link";
import { LayoutDashboard, Package, Calendar, BookOpen, ArrowLeft } from "lucide-react";

const NAV = [
  { key: "dashboard", href: "/szolgaltato/dashboard", label: "Áttekintés", icon: LayoutDashboard },
  { key: "szolgaltatasok", href: "/szolgaltato/szolgaltatasok", label: "Szolgáltatások", icon: Package },
  { key: "elerheto", href: "/szolgaltato/elerheto", label: "Elérhetőség", icon: Calendar },
  { key: "foglalasok", href: "/szolgaltato/foglalasok", label: "Foglalások", icon: BookOpen },
];

export default function ProviderNav({ companyName, active }: { companyName: string; active: string }) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Szolgáltatói portál</p>
            <p className="font-bold text-sni-text">{companyName}</p>
          </div>
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-sni-brand-blue">
            <ArrowLeft size={13} /> Vissza az oldalra
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link key={item.key} href={item.href}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active === item.key
                  ? "border-sni-brand-teal text-sni-brand-teal"
                  : "border-transparent text-gray-600 hover:border-sni-brand-teal hover:text-sni-brand-teal"
              }`}>
              <item.icon size={15} /> {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
