import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function AkademiaAdminPage() {
  const admin = createAdminClient();

  const [coursesRes, enrollmentsRes, certsRes] = await Promise.all([
    admin.from("academy_courses").select("id, status"),
    admin.from("academy_enrollments").select("id, status"),
    admin.from("academy_certificates").select("id, status"),
  ]);

  const courses = coursesRes.data ?? [];
  const enrollments = enrollmentsRes.data ?? [];
  const certs = certsRes.data ?? [];

  const stats = [
    { label: "Kurzusok", value: courses.length, sub: `${courses.filter((c) => c.status === "published").length} publikált`, href: "/admin/akademia/kurzusok" },
    { label: "Beiratkozások", value: enrollments.length, sub: `${enrollments.filter((e) => e.status === "completed").length} teljesített`, href: "/admin/akademia/partnerek" },
    { label: "Igazolások", value: certs.length, sub: `${certs.filter((c) => c.status === "valid").length} aktív`, href: "/admin/akademia/igazolasok" },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-sni-text mb-6">Védett Akadémia – Áttekintés</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-gray-100 bg-white shadow-soft p-5 hover:border-sni-brand-teal transition-colors">
            <p className="text-3xl font-black text-sni-brand-navy">{s.value}</p>
            <p className="font-semibold text-sni-text text-sm mt-0.5">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/akademia/kurzusok/uj"
          className="rounded-full bg-sni-brand-teal px-5 py-2 text-sm font-bold text-sni-brand-navy hover:bg-sni-brand-blue hover:text-white transition"
        >
          + Új kurzus
        </Link>
        <Link
          href="/admin/akademia/exportok"
          className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-600 hover:border-sni-brand-teal hover:text-sni-brand-teal transition"
        >
          CSV exportok
        </Link>
      </div>
    </div>
  );
}
