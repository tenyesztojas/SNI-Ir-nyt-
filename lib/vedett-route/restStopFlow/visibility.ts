// Sprint E Preparation Gate — alkalmazás-szintű láthatósági szűrő,
// VÉDELEM A MÉLYSÉGBEN a Supabase RLS mellett (lásd
// supabase/migrations/20260907_rest_points.sql — az elsődleges, DB-szintű
// védelem MINDIG az RLS, ez a függvény egy MÁSODIK réteg, nem helyettesíti
// azt).
//
// SZABÁLY (4. pont, Sprint E Preparation Gate spec): egy USER forrású,
// PRIVATE pihenőpont KIZÁRÓLAG a létrehozója számára látható. A
// VEDETT_SAROK és OSM források ebben a sprintben még nem aktívak
// ténylegesen (lásd rest_points_user_source_only CHECK constraint), de a
// függvény felkészülten kezeli őket a jövőre nézve: PUBLIC/CONNECTIONS
// láthatóságú pontok bárki számára látszanak, PRIVATE pontok pedig
// mindig csak a létrehozójuknak.

import type { RestPoint } from "../../rest-points/types.ts";

export function isRestPointVisibleToUser(restPoint: RestPoint, userId: string | null): boolean {
  if (restPoint.visibility === "PRIVATE") {
    return userId !== null && restPoint.createdBy === userId;
  }
  // CONNECTIONS/PUBLIC — ebben a sprintben nincs éles adat ilyen
  // láthatósággal (lásd rest_points_private_only CHECK constraint), de a
  // szűrő logikailag már felkészült rá: bárki látja, aki lekérdezi.
  return true;
}

export function filterVisibleRestPoints(restPoints: RestPoint[], userId: string | null): RestPoint[] {
  return restPoints.filter((rp) => isRestPointVisibleToUser(rp, userId));
}
