import Link from "next/link";
import { getPendingReports } from "@/lib/data";
import AdminReports from "@/components/AdminReports";

export default async function AdminReportsPage() {
  const pendingReports = await getPendingReports();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-sni-text">Hibajelentések kezelése</h1>
      <p className="mt-2 text-gray-600">
        Felhasználók által jelzett, &quot;pending&quot; státuszú hibás adatok / problémák.
      </p>
      <div className="mt-6">
        <AdminReports initial={pendingReports} />
      </div>
    </div>
  );
}
