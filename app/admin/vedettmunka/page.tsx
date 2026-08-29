import Link from "next/link";
import { Building2, Briefcase, Flag, ClipboardList } from "lucide-react";
import { adminGetVmKpis } from "@/lib/vedettmunka/data";

export const metadata = { title: "Admin – Védett Munka" };
export const dynamic = "force-dynamic";

export default async function AdminVedettMunkaPage() {
  const kpi = await adminGetVmKpis();

  const stats = [
    { label: "Munkáltatók összesen", value: kpi.employers_total, sub: `${kpi.employers_pending} jóváhagyásra vár`, icon: Building2, color: "text-sni-brand-teal" },
    { label: "Hirdetések összesen", value: kpi.jobs_total, sub: `${kpi.jobs_published} aktív · ${kpi.jobs_pending} feldolgozás alatt`, icon: Briefcase, color: "text-sni-brand-blue" },
    { label: "Nyitott jelentések", value: kpi.reports_open, sub: "Kezelésre vár", icon: Flag, color: "text-red-500" },
    { label: "Összes jelentkezés", value: kpi.applications_total, sub: "Napló bejegyzés", icon: ClipboardList, color: "text-gray-500" },
  ];

  const links = [
    { href: "/admin/vedettmunka/munkaltatok", label: "Munkáltatók kezelése", badge: kpi.employers_pending > 0 ? kpi.employers_pending : null },
    { href: "/admin/vedettmunka/hirdetesek", label: "Hirdetések kezelése", badge: kpi.jobs_pending > 0 ? kpi.jobs_pending : null },
    { href: "/admin/vedettmunka/jelentesek", label: "Hirdetés-jelentések", badge: kpi.reports_open > 0 ? kpi.reports_open : null },
    { href: "/admin/vedettmunka/jelentkezesek-log", label: "Jelentkezési napló", badge: null },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">← Admin áttekintés</Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Védett Munka admin</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <s.icon className={s.color} size={26} />
            <p className="mt-2 text-2xl font-bold">{s.value}</p>
            <p className="text-sm font-semibold text-gray-600">{s.label}</p>
            <p className="text-xs text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {links.map(({ href, label, badge }) => (
          <Link key={href} href={href} className="relative btn-secondary inline-flex items-center gap-2">
            {label}
            {badge !== null && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
