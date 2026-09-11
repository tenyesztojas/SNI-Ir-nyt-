// VPS ACCESSIBILITY SIDECAR — minimális típus-shim.
//
// A `TransitProviderId` a fő Next.js repo `lib/vedett-route/types.ts`
// fájljának EGYETLEN, ide szükséges exportja — a sidecar szándékosan NEM
// importálja az egész Next.js `types.ts`-t (az további, a sidecarhoz
// irreleváns, szerver-only Next.js típusokat és importokat hordozna).
//
// KARBANTARTÁS: ha a fő repo `TransitProviderId` uniója bővül (pl. egy
// jövőbeli MÁV/Volán dataset regisztrálásakor a motisIdNormalization.ts-ben),
// ezt a sort itt is frissíteni kell — lásd a deployment terv "sidecar fájlok
// szinkronban tartása" megjegyzését.
export type TransitProviderId = "BKK" | "MAV_RAIL" | "MAV_BUS";
