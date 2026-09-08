// Sprint E.1 — VédettSarok "places" -> RestPoint DTO leképezés,
// pihenőpont-alkalmassági szűréssel.
//
// KIZÁRÓLAG tiszta, Supabase-független logika — ez a modul SOSEM
// importál semmit a "@/lib/..." útvonal-aliason keresztül (csak relatív
// importokat használ), hogy node --test alól (path-alias resolver
// nélkül) is közvetlenül tesztelhető legyen. Lásd
// vedettSarokProvider.ts fejléce a dinamikus import indoklásáért (az a
// modul viszont TRANZITÍVEN "@/lib/..."-t importál a getApprovedPlaces()
// hívás miatt, ezért maga NEM tesztelhető közvetlenül) — a tényleges
// szűrési/leképezési LOGIKÁT emiatt szándékosan ide, egy külön, alias-
// mentes modulba emeltük ki.
//
// PIHENŐPONT-ALKALMASSÁG (Sprint E.1 hotfix, 2026-09-08, staging audit):
// lásd vedettSarokProvider.ts fejléce a teljes indoklásért. Röviden:
// place.restPointEligible === true EXPLICIT admin/moderációs döntés
// KIZÁRÓLAG ez dönt — SOHA nem következtetünk a category mezőből.
// UNKNOWN != ELIGIBLE.

import { haversineDistanceMeters } from "../ranking.ts";
import type { RestPoint } from "../../../rest-points/types.ts";
import type { Place } from "../../../types.ts";

export function placeToRestPointIfEligible(
  place: Place,
  origin: { lat: number; lon: number },
  radiusMeters: number
): RestPoint | null {
  // Csak létező, koordinátával rendelkező rekord — koordináta nélküli
  // hely NEM jelenhet meg (nincs "kitalált" pozíció).
  if (place.latitude === undefined || place.longitude === undefined) return null;

  // Explicit pihenőpont-alkalmassági kapu — NEM kategórianév-alapú
  // következtetés, kizárólag ez a mező dönt. Amíg egy hely nincs
  // explicit megjelölve, kimarad (biztonságos alapállapot).
  if (place.restPointEligible !== true) return null;

  const distanceMeters = haversineDistanceMeters(origin, { lat: place.latitude, lon: place.longitude });
  if (distanceMeters > radiusMeters) return null;

  return {
    id: `vedett-sarok:${place.id}`,
    // Nincs valódi "létrehozó felhasználó" ennél a forrásnál — a
    // rest_points DB séma createdBy mezője itt SOHA nem kerül
    // beírásra (ez egy in-memory DTO), a sentinel csak a RestPoint
    // interfész kitöltéséhez kell.
    createdBy: "vedett-sarok",
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    source: "VEDETT_SAROK",
    visibility: "PUBLIC",
    // UNKNOWN != FALSE — a "places" séma jelenleg nem tartalmaz ilyen
    // mezőket, SOSEM találjuk ki (spec 5. pont).
    toilet: null,
    seating: null,
    quietSpace: null,
    indoors: null,
    outdoors: null,
    purchaseRequired: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    category: "VEDETT_SAROK",
  };
}
