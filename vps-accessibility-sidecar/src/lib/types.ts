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
// STATION NAME SEARCH sprint (2026-09-24) -- "VOLAN" ITT, a sidecar
// HELYI shimjeben kerult hozzaadasra, KIZAROLAG a buildIndex.ts manifest
// "provider" (ember-olvashato diagnosztika) mezojehez -- ez a bovites
// SZANDEKOSAN NEM kerult at a fo repo lib/vedett-route/types.ts kanonikus
// TransitProviderId uniojaba, mert az a MOTIS kompozit-ID normalizalashoz
// (motisIdNormalization.ts KNOWN_MOTIS_DATASET_TAGS) van hasznalva, es ott
// egy Volan MOTIS dataset-tag meg NINCS runtime-ban megfigyelve (lasd
// motisIdNormalization.ts fejlece "Fazis 2" megjegyzese) -- a manifest
// provider mezo viszont pusztan diagnosztikai string, sosem kerul MOTIS-
// kompozit-ID ertelmezesre.
export type TransitProviderId = "BKK" | "MAV_RAIL" | "MAV_BUS" | "VOLAN";
