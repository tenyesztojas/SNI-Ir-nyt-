import type { CarRouteGeometry } from "../types.ts";

function encodeSigned(value: number): string {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let output = "";

  while (encoded >= 0x20) {
    output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }

  output += String.fromCharCode(encoded + 63);
  return output;
}

export function encodePolyline6(geometry: CarRouteGeometry): string {
  let lastLat = 0;
  let lastLon = 0;
  let output = "";

  for (const [lon, lat] of geometry.coordinates) {
    const latInt = Math.round(lat * 1_000_000);
    const lonInt = Math.round(lon * 1_000_000);

    output += encodeSigned(latInt - lastLat);
    output += encodeSigned(lonInt - lastLon);

    lastLat = latInt;
    lastLon = lonInt;
  }

  return output;
}
