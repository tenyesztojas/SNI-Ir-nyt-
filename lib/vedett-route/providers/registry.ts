// Transit Provider registry. BKK élő, kulcsos API-n keresztül; MÁV vasút és
// MÁV/Volán busz Fázis 2-ben admin-feltöltött statikus GTFS-en keresztül
// (lásd staticFileProvider.ts fejléce — nincs dokumentált kulcsos API/
// realtime forrás ezekhez, ezért nem is állítunk elő ilyet mesterségesen).

import type { TransitProvider, TransitProviderId } from "../types.ts";
import { BkkProvider } from "./bkk.ts";
import { StaticOnlyGtfsProvider } from "./staticFileProvider.ts";

const providers: Partial<Record<TransitProviderId, TransitProvider>> = {
  BKK: new BkkProvider(),
  MAV_RAIL: new StaticOnlyGtfsProvider("MAV_RAIL", "mav_rail", "MÁV (vasút)"),
  MAV_BUS: new StaticOnlyGtfsProvider("MAV_BUS", "mav_bus", "MÁV/Volán (autóbusz)"),
};

export function getTransitProvider(id: TransitProviderId): TransitProvider | null {
  return providers[id] ?? null;
}

export function getActiveProviders(): TransitProvider[] {
  return Object.values(providers).filter((p): p is TransitProvider => Boolean(p));
}
