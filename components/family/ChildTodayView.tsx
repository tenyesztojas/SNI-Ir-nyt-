// Védett Napom — gyermekbarát, CSAK OLVASHATÓ kezdőképernyő az aktív
// gyermekfióknak. Szerverkomponens-burok: a hozzáférést a /csalad oldal
// (getLinkedChildSelfView) dönti el; az élő megjelenítés a ChildTodayLive.
// Nincs szerkesztés, törlés vagy családkezelés.

import type { FamilyChildView } from "@/lib/family/data";
import type { TravelStatusRow } from "@/lib/family/travelStatus";
import ChildTodayLive from "@/components/family/ChildTodayLive";

export default function ChildTodayView({
  child,
  now = new Date(),
  travelRows = [],
}: {
  child: FamilyChildView;
  now?: Date;
  // A szerveren tárolt mai és tegnapi utazási sorok (saját gyermek).
  travelRows?: TravelStatusRow[];
}) {
  return (
    <ChildTodayLive
      child={child}
      nowIso={now.toISOString()}
      travelRows={travelRows}
    />
  );
}
