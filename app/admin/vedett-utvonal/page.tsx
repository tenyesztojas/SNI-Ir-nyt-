// /admin/vedett-utvonal — Védett Útvonal admin tesztfelület (Fázis 1).
//
// Az admin-only gate-et az app/admin/layout.tsx már biztosítja minden
// /admin/* oldalra (nem-admin → redirect "/"-re). Ezen felül a funkcionális
// API végpontok (keresés, GTFS frissítés) saját maguk is ellenőrzik az
// admin szerepkört ÉS a feature flaget (lib/vedett-route/access.ts) —
// tehát közvetlen API hívással sem kerülhető meg a védelem.

import Link from "next/link";
import { getVedettRouteStatus } from "@/lib/vedett-route/status";
import { isVedettRouteFeatureEnabled } from "@/lib/vedett-route/config";
import VedettUtvonalStatusPanel from "@/components/vedett-utvonal/VedettUtvonalStatusPanel";
import VedettUtvonalSearchForm from "@/components/vedett-utvonal/VedettUtvonalSearchForm";
import VedettUtvonalGtfsUploadForm from "@/components/vedett-utvonal/VedettUtvonalGtfsUploadForm";

export default async function VedettUtvonalAdminPage() {
  const status = await getVedettRouteStatus();
  const enabled = isVedettRouteFeatureEnabled();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm text-sni-brand-blue hover:underline">
        ← Admin áttekintés
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-sni-text">Védett Útvonal</h1>
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">NEM PUBLIKUS</span>
      </div>
      <p className="mt-1 text-gray-600">Fejlesztési / admin tesztfelület</p>

      <div className="mt-6 space-y-6">
        <VedettUtvonalStatusPanel status={status} />
        <VedettUtvonalGtfsUploadForm disabled={!enabled} />
        <VedettUtvonalSearchForm disabled={!enabled} />
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Ez a modul kizárólag admin felhasználók számára érhető el, publikus VédettSarok
        felhasználók sem a menüből, sem közvetlen URL-lel nem érik el. Részletek:
        docs/vedett-route.md.
      </p>
    </div>
  );
}
