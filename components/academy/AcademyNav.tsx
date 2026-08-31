"use client";
import Link from "next/link";
import { LayoutDashboard, Users, Mail, CheckCircle, Award, ArrowLeft, GraduationCap } from "lucide-react";

const NAV = [
  { key: "attekintes",    href: "/akademia",                label: "Áttekintés",   icon: LayoutDashboard },
  { key: "munkatarsak",   href: "/akademia/munkatarsak",    label: "Munkatársak",  icon: Users },
  { key: "meghivasok",    href: "/akademia/meghivasok",     label: "Meghívások",   icon: Mail },
  { key: "teljesitesek",  href: "/akademia/teljesitesek",   label: "Teljesítések", icon: CheckCircle },
  { key: "igazolasok",    href: "/akademia/igazolasok",     label: "Igazolások",   icon: Award },
];

export default function AcademyNav({
  companyName,
  active,
}: {
  companyName: string;
  active: string;
}) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <GraduationCap size={20} className="text-sni-brand-teal" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Védett Akadémia – {companyName}
              </p>
              <p className="text-xs font-semibold text-sni-brand-navy">Képzések és munkatársi teljesítések</p>
            </div>
          </div>
          <Link
            href="/szolgaltato/dashboard"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-sni-brand-blue"
          >
            <ArrowLeft size={13} /> Partner portál
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active === item.key
                  ? "border-sni-brand-teal text-sni-brand-teal"
                  : "border-transparent text-gray-600 hover:border-sni-brand-teal hover:text-sni-brand-teal"
              }`}
            >
              <item.icon size={14} /> {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
