import Link from "next/link";
import { MapPin, Star, Flag, Mail, Users, PlusCircle, Map, MessageCircle, Tv2, Briefcase } from "lucide-react";
import { getApprovedPlaces, getFlaggedReviews, getPendingReports } from "@/lib/data";
import PushNotifButton from "@/components/PushNotifButton";
import AdminPwaStats from "@/components/AdminPwaStats";

export default async function AdminOverviewPage() {
  const [places, flaggedReviews, pendingReports] = await Promise.all([
    getApprovedPlaces(),
    getFlaggedReviews(),
    getPendingReports(),
  ]);

  const stats = [
    { label: "Közzétett hely", value: places.length, icon: MapPin },
    { label: "Megjelölt értékelés", value: flaggedReviews.length, icon: Star },
    { label: "Nyitott hibajelentés", value: pendingReports.length, icon: Flag },
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

      <AdminPwaStats />

      <div className="mt-4">
        <PushNotifButton />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/admin/helyek/uj" className="btn-primary inline-flex items-center gap-2">
          <PlusCircle size={16} /> Új hely felvitele
        </Link>
<Link href="/admin/helyek/osszes" className="btn-secondary inline-flex items-center gap-2">
          <MapPin size={16} /> Összes hely szerkesztése
        </Link>
        <Link href="/admin/ertekelesek" className="btn-secondary">
          Értékelések moderálása
        </Link>
        <Link href="/admin/jelzesek" className="btn-secondary">
          Hibajelentések kezelése
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
        <Link href="/admin/igenylesek" className="btn-secondary inline-flex items-center gap-2">
          Hely-igénylések
        </Link>
        <Link href="/admin/szolgaltatok" className="btn-secondary inline-flex items-center gap-2">
          Szolgáltatók
        </Link>
        <Link href="/admin/vedett-jelzes" className="btn-secondary inline-flex items-center gap-2">
          Védett Jelzés
        </Link>
        <Link href="/admin/naplo" className="btn-secondary inline-flex items-center gap-2">
          Helyek naplója
        </Link>
        <Link href="/admin/media" className="btn-secondary inline-flex items-center gap-2">
          <Tv2 size={16} /> Médiamegjelenések
        </Link>
        <Link href="/admin/vedettmunka" className="btn-secondary inline-flex items-center gap-2">
          <Briefcase size={16} /> VédettMunka
        </Link>
        <Link href="/admin/ertekelesek/osszes" className="btn-secondary inline-flex items-center gap-2">
          Összes értékelés
        </Link>
        <Link href="/admin/kozosseg" className="btn-secondary inline-flex items-center gap-2">
          <MessageCircle size={16} /> Közösség moderáció
        </Link>
        <Link href="/admin/kozosseg/jelentesek" className="btn-secondary inline-flex items-center gap-2">
          <Flag size={16} /> Közösségi jelentések
        </Link>
        <Link
          href="/admin/vedett-utvonal"
          className="btn-secondary inline-flex items-center gap-2 border border-amber-400"
        >
          <Map size={16} /> Védett Útvonal
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
            NEM PUBLIKUS
          </span>
        </Link>
      </div>
    </div>
  );
}
