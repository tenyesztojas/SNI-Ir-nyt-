import Link from "next/link";
import { ShieldCheck, MapPin, Star, Flag, Mail, Users } from "lucide-react";
import { getApprovedPlaces, getPendingPlaces, getPendingReviews, getPendingReports } from "@/lib/data";

export default async function AdminOverviewPage() {
  const [places, pendingPlaces, pendingReviews, pendingReports] = await Promise.all([
    getApprovedPlaces(),
    getPendingPlaces(),
    getPendingReviews(),
    getPendingReports(),
  ]);

  const stats = [
    { label: "Jóváhagyott hely", value: places.length, icon: MapPin },
    { label: "Jóváhagyásra váró hely", value: pendingPlaces.length, icon: ShieldCheck },
    { label: "Jóváhagyásra váró értékelés", value: pendingReviews.length, icon: Star },
    { label: "Nyitott hibajeléntés", value: pendingReports.length, icon: Flag },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-sni-text">Admin áttekintés</h1>
      <p className="mt-2 text-gray-600">
        Csak admin szerepkörű felhasználók érik el (Supabase Auth + RLS alapján).
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-3">
            <s.icon className="text-sni-brand-blue" size={28} />
            <div>
              <p className="text-2xl font-bold text-sni-text">{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/helyek" className="btn-primary">
          Beküldött helyek kezelése
        </Link>
        <Link href="/admin/ertekelesek" className="btn-secondary">
          Értékelések moderálása
        </Link>
        <Link href="/admin/jelzesek" className="btn-secondary">
          Hibajeléntések kezelése
        </Link>
        <Link href="/admin/hirlevel" className="btn-secondary inline-flex items-center gap-2">
          <Mail size={16} /> Hírlevél küldése
        </Link>
        <Link href="/admin/programok" className="btn-secondary">
          Programajánlók kezelése
        </Link>
        <Link href="/admin/felhasznalok" className="btn-secondary inline-flex items-center gap-2">
          <Users size={16} /> Felhasználók
        </Link>
      </div>
    </div>
  );
}
