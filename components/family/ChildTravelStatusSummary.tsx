"use client";

// Szülői/gondviselői nézet: a gyermek LEGFRISSEBB rögzített utazási
// jelzése (a gyermek által megnyomott gomb) — nem helykövetés. Az élő
// adat a TravelStatusLive kontextusból jön; nélküle a szerveres kezdőérték.

import { FAMILY_TIME_ZONE } from "@/lib/family/todaySchedule";
import { TRAVEL_STATUS_LABEL } from "@/lib/family/travelStatus";
import type { TravelStatusWithTitle } from "@/lib/family/travelStatusData";
import { useTravelLive } from "@/components/family/TravelStatusLive";

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: FAMILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function ChildTravelStatusSummary({
  childId,
  status: initialStatus,
}: {
  childId: string;
  status: TravelStatusWithTitle | undefined;
}) {
  const live = useTravelLive();
  const status = live ? live.statuses[childId] : initialStatus;
  if (!status) return live?.failed ? <p className="mt-2 text-xs text-gray-500">Az utazási jelzések frissítése most nem sikerült.</p> : null;

  // A segítségkérés a megérkezés után is látható marad (help_requested_at).
  const helpActive = status.status === "help_requested";
  const helpEarlier = !helpActive && Boolean(status.help_requested_at);
  return (
    <div
      role={helpActive ? "alert" : undefined}
      className={`mt-2 rounded-xl px-4 py-3 text-sm ${
        helpActive ? "border-2 border-red-600 bg-red-50 text-red-900" : helpEarlier ? "border-2 border-amber-500 bg-amber-50 text-gray-900" : "border border-gray-100 bg-gray-50 text-gray-800"
      }`}
    >
      <p className="font-semibold">
        Legutóbbi utazási jelzés: {TRAVEL_STATUS_LABEL[status.status]}
        {helpActive && " – a gyermek segítséget kért"}
      </p>
      <p>
        {status.title ?? "Napirendi program"} · utolsó változás: {fmt(status.updated_at)}
      </p>
      <ul className="mt-1 space-y-0.5">
        {status.departed_at && <li>Elindult: {fmt(status.departed_at)}</li>}
        {status.status === "help_requested" && status.help_requested_at && <li>Segítséget kért: {fmt(status.help_requested_at)}</li>}
        <li>{status.status === "arrived" && status.arrived_at ? `Az utazás lezárult – megérkezett: ${fmt(status.arrived_at)}` : "Az utazás még nem zárult le."}</li>
      </ul>
      <p className="mt-1 text-xs text-gray-600">A jelzéseket a gyermek maga adja; nem helymeghatározáson alapulnak.</p>
      {helpEarlier && status.help_requested_at && (
        <p className="mt-1 font-semibold text-red-800">Útközben segítséget kért: {fmt(status.help_requested_at)}</p>
      )}
      {(helpActive || helpEarlier) && (
        <p className="mt-1 text-xs">A jelzésről nem megy automatikus értesítés; szükség esetén vedd fel a kapcsolatot a gyermekkel.</p>
      )}
      <p className="mt-1 text-xs text-gray-500">
        {live?.failed
          ? "A frissítés most nem sikerült – a fenti adat a legutóbb betöltött állapot."
          : "Nyitott oldalon kb. percenként frissül. Ez nem vészhelyzeti értesítés."}
      </p>
    </div>
  );
}
