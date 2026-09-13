// lib/vedett-route/searchRequestBuilder.ts
//
// Pure, React-független segédmodul a keresési kérés mezőinek összeállításához.
// A VedettUtvonalSearchForm.tsx handleSubmit()-je ezt importálja (és importálta
// implicit, inline módon korábban) — kiszervezve a cél KIZÁRÓLAG a
// tesztelhetőség: Node.js test futtatója React-függőség nélkül importálhatja.
//
// BIZTONSÁGI INVARIÁNS (változatlan az eredeti handleSubmit-ből):
//   - MAP_PICKED és KNOWN_PLACE destination → toCoordinates (NEM re-geokódol)
//   - MAP_PICKED és CURRENT_LOCATION origin → fromCoordinates (NEM re-geokódol)
//   - Csak MANUAL origin/destination → from/to string → szerver geocodeAddress()-t hív
//
// STREET-LEVEL FALLBACK (2026-09-12) — a "Az utca közelítő helyével tervezek"
// gomb MAP_PICKED-re állítja az origin/destination state-et, ezért a következő
// request AUTOMATIKUSAN toCoordinates/fromCoordinates-t küld, NEM geokódolja
// újra a hibás házszámos cím-stringet. Ez a modul tesztelhető bizonysága
// ennek az invariánsnak.

export type RouteOriginManual = {
  type: "MANUAL";
  city: string;
  districtOrPostalCode: string;
  street: string;
};
export type RouteOriginCurrentLocation = {
  type: "CURRENT_LOCATION";
  latitude: number;
  longitude: number;
};
export type RouteOriginMapPicked = {
  type: "MAP_PICKED";
  name: string;
  latitude: number;
  longitude: number;
};
export type RouteOrigin = RouteOriginManual | RouteOriginCurrentLocation | RouteOriginMapPicked;

export type RouteDestinationManual = {
  type: "MANUAL";
  city: string;
  districtOrPostalCode: string;
  street: string;
};
export type RouteDestinationKnownPlace = {
  type: "KNOWN_PLACE";
  name: string;
  latitude: number;
  longitude: number;
};
export type RouteDestinationMapPicked = {
  type: "MAP_PICKED";
  name: string;
  latitude: number;
  longitude: number;
};
export type RouteDestination =
  | RouteDestinationManual
  | RouteDestinationKnownPlace
  | RouteDestinationMapPicked;

// Egyezik a VedettUtvonalSearchForm.tsx buildStructuredAddress() logikájával —
// szándékosan másolja azt (nem importálja a komponenst, mert az React-függő).
export function buildStructuredAddressString(addr: {
  city: string;
  districtOrPostalCode: string;
  street: string;
}): string {
  const city = addr.city.trim();
  const districtOrPostalCode = addr.districtOrPostalCode.trim();
  const street = addr.street.trim();
  const isPostalCode = /^\d{4}$/.test(districtOrPostalCode);
  const cityLine = isPostalCode
    ? [districtOrPostalCode, city].filter(Boolean).join(" ")
    : [city, districtOrPostalCode].filter(Boolean).join(", ");
  return [cityLine, street].filter(Boolean).join(", ");
}

// Egyezik a VedettUtvonalSearchForm.tsx handleSubmit originFields-logikájával.
// MAP_PICKED → fromCoordinates (NEM geokódol újra).
// CURRENT_LOCATION → fromCoordinates (NEM geokódol újra).
// MANUAL → from: string (szerver geocodeAddress()-t hív).
export function buildSearchRequestOriginFields(
  origin: RouteOrigin
): Record<string, unknown> {
  if (origin.type === "CURRENT_LOCATION") {
    return {
      fromCoordinates: { latitude: origin.latitude, longitude: origin.longitude },
    };
  }
  if (origin.type === "MAP_PICKED") {
    return {
      fromCoordinates: { latitude: origin.latitude, longitude: origin.longitude },
      fromName: origin.name,
    };
  }
  // MANUAL
  return { from: buildStructuredAddressString(origin) };
}

// Egyezik a VedettUtvonalSearchForm.tsx handleSubmit destinationFields-logikájával.
// KNOWN_PLACE | MAP_PICKED → toCoordinates (NEM geokódol újra).
// MANUAL → to: string (szerver geocodeAddress()-t hív).
export function buildSearchRequestDestinationFields(
  destination: RouteDestination
): Record<string, unknown> {
  if (destination.type === "KNOWN_PLACE" || destination.type === "MAP_PICKED") {
    return {
      toCoordinates: { latitude: destination.latitude, longitude: destination.longitude },
      toName: destination.name,
    };
  }
  // MANUAL
  return { to: buildStructuredAddressString(destination) };
}
