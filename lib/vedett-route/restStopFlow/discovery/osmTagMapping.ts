// Sprint E.1 — OSM tag -> RestPoint attribútum leképezés.
//
// SZÁNDÉKOSAN PURE, hálózat-független modul (nincs fetch, nincs
// Overpass-hívás itt) — így a leképezési szabályok külön, gyorsan
// tesztelhetők valós/reprezentatív tag-kombinációkkal, az Overpass
// hálózati réteg (osmProvider.ts) nélkül.
//
// ALAPELV (spec 7. pont, szó szerint): "UNKNOWN != FALSE". Egy hiányzó
// OSM tag SOSEM jelent explicit "false"-t — például egy amenity=bench
// elemnek nincs "toilets" tag-je, ez NEM jelenti azt, hogy nincs mosdó a
// közelben, csak azt, hogy ERRŐL AZ ELEMRŐL nincs ilyen adat. Csak
// TÉNYLEGES tag alapján állítunk true/false attribútumot, minden más
// esetben a mező null (UNKNOWN) marad.
//
// KATEGÓRIA-SZŰKÍTÉS (spec 6. pont): csak az explicit felsorolt 8 OSM
// kategória kerül be pihenőpontként — NEM veszünk fel automatikusan
// boltot/éttermet/kávézót/szolgáltatást (ez túlterhelné a listát, spec 6.
// pont záró bekezdése).
//
// SOSEM következtetünk "autizmusbarát"/"szenzorosan nyugodt" státuszra
// (spec 7. pont, "KÜLÖNÖSEN" bekezdés) — pl. park != automatikusan
// csendes, library != automatikusan szenzorosan nyugodt. A quietSpace
// mező ezért OSM forrásból SOHA nem kerül kitöltésre (mindig null).

import type { RestPointCategory } from "../../../rest-points/types.ts";

// A támogatott OSM kategóriák Overpass szűrő-feltételei (spec 6. pont,
// A-H betűk szerint, szó szerint ugyanazok a kulcs=érték párok).
export interface OsmCategoryDef {
  category: RestPointCategory;
  key: string;
  value: string;
  // Rövid, magyar UI-név — a valós OSM "name" tag hiányában ez a fallback
  // (lásd deriveOsmPointName lent), SOHA nem kitalált egyedi névként,
  // csak generikus kategórianévként.
  genericName: string;
}

export const OSM_CATEGORY_DEFS: OsmCategoryDef[] = [
  { category: "TOILET", key: "amenity", value: "toilets", genericName: "Nyilvános mosdó" },
  { category: "BENCH", key: "amenity", value: "bench", genericName: "Pad" },
  { category: "PICNIC", key: "leisure", value: "picnic_table", genericName: "Piknikező asztal" },
  { category: "PARK", key: "leisure", value: "park", genericName: "Park" },
  { category: "GARDEN", key: "leisure", value: "garden", genericName: "Kert" },
  { category: "SHELTER", key: "amenity", value: "shelter", genericName: "Fedett menedék" },
  { category: "LIBRARY", key: "amenity", value: "library", genericName: "Könyvtár" },
  { category: "COMMUNITY", key: "amenity", value: "community_centre", genericName: "Közösségi tér" },
];

export interface OsmElementTags {
  [key: string]: string | undefined;
}

// Egyetlen elem 1-nél több def-nek is megfelelhet elméletileg (ritka), de
// az Overpass query-nk (lásd osmProvider.ts) kategóriánként külön kéri le
// -- itt csak az ELSŐ egyező definíciót adjuk vissza, determinisztikusan
// (a fenti tömb sorrendje szerint).
export function matchOsmCategory(tags: OsmElementTags): OsmCategoryDef | null {
  for (const def of OSM_CATEGORY_DEFS) {
    if (tags[def.key] === def.value) return def;
  }
  return null;
}

export interface OsmDerivedAttributes {
  seating: boolean | null;
  toilet: boolean | null;
  indoors: boolean | null;
  outdoors: boolean | null;
  purchaseRequired: boolean | null;
  // Nem RestPoint mező, csak a szűréshez/naplózáshoz — true, ha az elemet
  // NEM szabad ajánlani (access=private), lásd deriveOsmAttributes lent.
  excludedPrivateAccess: boolean;
  // true, ha az access korlátozott, de nem feltétlenül teljesen tiltott
  // (pl. access=customers) — a hívó ilyenkor NEM alapértelmezettként
  // ajánlja, vagy egyértelműen jelöli a korlátozást (spec 7. pont).
  restrictedAccess: boolean;
}

// A tényleges tag -> attribútum leképezés (spec 7. pont példái szerint,
// szó szerint):
//   amenity=bench            -> seating=true
//   leisure=picnic_table     -> seating=true
//   amenity=toilets          -> toilet=true
//   toilets=yes              -> toilet=true
//   access=private           -> excludedPrivateAccess=true (NE ajánld)
//   access=customers         -> restrictedAccess=true (korlátozott)
export function deriveOsmAttributes(category: RestPointCategory, tags: OsmElementTags): OsmDerivedAttributes {
  let seating: boolean | null = null;
  let toilet: boolean | null = null;
  let indoors: boolean | null = null;
  let outdoors: boolean | null = null;
  const purchaseRequired: boolean | null = tags.fee === "yes" ? true : tags.fee === "no" ? false : null;

  if (category === "BENCH" || category === "PICNIC") {
    seating = true;
  }
  if (category === "TOILET" || tags.toilets === "yes") {
    toilet = true;
  }
  if (category === "SHELTER" || category === "LIBRARY" || category === "COMMUNITY") {
    indoors = true;
  }
  if (category === "PARK" || category === "GARDEN" || category === "PICNIC" || category === "BENCH") {
    outdoors = true;
  }
  if (tags.indoor === "yes") indoors = true;
  if (tags.indoor === "no") indoors = false;
  if (tags.covered === "yes") indoors = indoors ?? true;

  const excludedPrivateAccess = tags.access === "private" || tags.access === "no";
  const restrictedAccess = tags.access === "customers" || tags.access === "permit";

  return { seating, toilet, indoors, outdoors, purchaseRequired, excludedPrivateAccess, restrictedAccess };
}

// Az OSM elem valós "name" tag-jét használja, ha van — különben a
// kategória generikus magyar nevét (SOSEM kitalált egyedi nevet).
export function deriveOsmPointName(def: OsmCategoryDef, tags: OsmElementTags): string {
  const name = tags.name?.trim();
  return name && name.length > 0 ? name : def.genericName;
}
