import type { VedettRouteStatus } from "@/lib/vedett-route/status";

function Light({ ok }: { ok: boolean }) {
  return <span aria-hidden>{ok ? "🟢" : "🔴"}</span>;
}

const PROVIDER_LABELS = {
  BKK: "BKK",
  MAV_RAIL: "MÁV – vasút",
  MAV_BUS: "MÁV / Volán – autóbusz",
} as const;

export default function VedettUtvonalStatusPanel({ status }: { status: VedettRouteStatus }) {
  const bkk = status.providers.BKK;

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: "BKK API", value: <><Light ok={bkk.connection.reachable} /> {bkk.connection.configured ? (bkk.connection.reachable ? "Elérhető" : "Nem elérhető") : "Nincs konfigurálva"}</> },
    { label: "BKK GTFS", value: <><Light ok={bkk.staticData.available} /> {bkk.staticData.available ? "Letöltve" : "Még nincs letöltve"}</> },
    { label: "BKK Realtime", value: <><Light ok={bkk.connection.realtime} /> {bkk.connection.realtime ? "Aktív" : "Nem elérhető"}</> },
    { label: "Routing Engine (MOTIS)", value: <><Light ok={status.routingEngine.configured} /> {status.routingEngine.configured ? "Konfigurálva" : "Nincs beüzemelve"}</> },
    {
      label: "Utolsó GTFS frissítés (BKK)",
      value: bkk.staticData.lastUpdated ? new Date(bkk.staticData.lastUpdated).toLocaleString("hu-HU") : "—",
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
        {(Object.keys(PROVIDER_LABELS) as Array<keyof typeof PROVIDER_LABELS>).map((id) => {
          const p = status.providers[id];
          return (
            <div key={id} className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
              <dt className="text-gray-600">{PROVIDER_LABELS[id]}</dt>
              <dd className="font-medium text-sni-text">
                {p.staticData.available ? (
                  <span className="inline-flex items-center gap-1"><Light ok /> Aktív (statikus GTFS){p.staticData.feedVersion ? ` · ${p.staticData.feedVersion}` : ""}</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><Light ok={false} /> {id === "BKK" ? "Nem aktív" : "Nincs feltöltve"}</span>
                )}
              </dd>
            </div>
          );
        })}
        <div className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm">
          <dt className="text-gray-600">Sensory Engine</dt>
          <dd className="inline-flex items-center gap-1 text-gray-400">
            <span aria-hidden>⚪</span> {status.upcoming.sensoryEngine}
          </dd>
        </div>
      </dl>
    </div>
  );
}
