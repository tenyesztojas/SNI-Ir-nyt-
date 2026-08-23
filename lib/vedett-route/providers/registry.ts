// Transit Provider registry — jelenleg csak BKK. A Fázis 2 ide adja majd
// hozzá a MAV_RAIL és MAV_BUS providereket, anélkül hogy a hívó kódnak
// (routing engine, admin API) bármit módosítania kellene.

import type { TransitProvider, TransitProviderId } from "../types.ts";
import { BkkProvider } from "./bkk.ts";

const providers: Partial<Record<TransitProviderId, TransitProvider>> = {
  BKK: new BkkProvider(),
  // MAV_RAIL: — Fázis 2, még nincs implementálva.
  // MAV_BUS:  — Fázis 2, még nincs implementálva.
};

export function getTransitProvider(id: TransitProviderId): TransitProvider | null {
  return providers[id] ?? null;
}

export function getActiveProviders(): TransitProvider[] {
  return Object.values(providers).filter((p): p is TransitProvider => Boolean(p));
}
