import Link from "next/link";
import { BookOpen, Users, Award, Download, GraduationCap, ArrowLeft } from "lucide-react";

const NAV = [
  { href: "/admin/akademia", label: "Áttekintés", icon: GraduationCap },
  { href: "/admin/akademia/kurzusok", label: "Kurzusok", icon: BookOpen },
  { href: "/admin/akademia/partnerek", label: "Partnerek", icon: Users },
  { href: "/admin/akademia/igazolasok", label: "Igazolások", icon: Award },
  { href: "/admin/akademia/exportok", label: "Exportok", icon: Download },
];

export default function AkademiaAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <GraduationCap size={18} className="text-sni-brand-teal" />
              <span className="font-bold text-sni-text text-sm">Védett Akadémia – Admin</span>
            </div>
            <Link href="/admin" className="text-xs text-gray-500 hover:text-sni-brand-blue flex items-center gap-1">
              <ArrowLeft size={12} /> Admin főoldal
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-0">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-gray-600 whitespace-nowrap hover:border-sni-brand-teal hover:text-sni-brand-teal transition-colors"
              >
                <item.icon size={14} /> {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </div>
    </div>
  );
}
