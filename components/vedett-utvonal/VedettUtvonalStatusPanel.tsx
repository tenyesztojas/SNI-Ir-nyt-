import type { VedettRouteStatus } from "@/lib/vedett-route/status";

function Light({ ok }: { ok: boolean }) {
  return <span aria-hidden>{ok ? "🟢" : "🔴"}</span>;
}

function Soon() {
  return (
    <span className="inline-flex items-center gap-1 text-gray-400">
      <span aria-hidden>⚪</span> Hamarosan
    </span>
  );
}

export default function VedettUtvonalStatusPanel({ status }: { status: VedettRouteStatus }) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: "BKK API", value: <><Light ok={status.bkk.api.reachable} /> {status.bkk.api.configured ? (status.bkk.api.reachable ? "Elérhető" : "Nem elérhető") : "Nincs konfigurálva"}</> },
    { label: "BKK GTFS", value: <><Light ok={status.bkk.gtfsStatic.available} /> {status.bkk.gtfsStatic.available ? "Letöltve" : "Még nincs letöltve"}</> },
    { label: "BKK Realtime", value: <><Light ok={status.bkk.api.realtime} /> {status.bkk.api.realtime ? "Aktív" : "Nem elérhető"}</> },
    { label: "Routing Engine (MOTIS)", value: <><Light ok={status.routingEngine.configured} /> {status.routingEngine.configured ? "Konfigurálva" : "Nincs beüzemelve"}</> },
    {
      label: "Utolsó GTFS frissítés",
      value: status.bkk.gtfsStatic.lastUpdated
        ? new Date(status.bkk.gtfsStatic.lastUpdated).toLocaleString("hu-HU")
        : "—",
    },
    { label: "Feature State", value: <span className="font-semibold">{status.featureFlag.enabled ? "ADMIN ONLY (bekapcsolva)" : "KIKAPCSOLVA"}</span> },
  ];

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-sni-text">Technikai státusz</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
            <dt className="text-gray-600">{r.label}</dt>
            <dd className="font-medium text-sni-text">{r.value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-4 text-sm font-semibold text-gray-500">Adatforrások</h3>
      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
          <dt className="text-gray-600">BKK</dt>
          <dd className="font-medium text-sni-text">
            {status.bkk.api.reachable ? (
              <span className="inline-flex items-center gap-1"><Light ok /> Aktív</span>
            ) : (
              <span className="inline-flex items-center gap-1"><Light ok={false} /> Nem aktív</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
          <dt className="text-gray-600">MÁV – vasút</dt>
          <dd><Soon /></dd>
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
          <dt className="text-gray-600">MÁV / Volán – autóbusz</dt>
          <dd><Soon /></dd>
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
          <dt className="text-gray-600">Sensory Engine</dt>
          <dd><Soon /></dd>
        </div>
      </dl>
    </div>
  );
}
