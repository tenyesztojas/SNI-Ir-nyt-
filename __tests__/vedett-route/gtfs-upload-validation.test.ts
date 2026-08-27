// GTFS feltöltés validáció tesztek (Fázis 2 — MÁV/Volán admin upload).
// Szintetikus, minimális zip fixture-öket épít memóriában (nem valós
// forgalmi adat — csak a validátor struktúra-ellenőrzését teszteli).
//   node --test __tests__/vedett-route/gtfs-upload-validation.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import AdmZip from "../../node_modules/adm-zip/adm-zip.js";
import { validateGtfsZip } from "../../lib/vedett-route/providers/staticFileProvider.ts";

function buildZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content, "utf-8"));
  }
  return zip.toBuffer();
}

test("teljes GTFS struktúra (mind az 5 kötelező fájl) érvényesnek minősül", () => {
  const buf = buildZip({
    "agency.txt": "agency_id,agency_name\n1,Teszt\n",
    "stops.txt": "stop_id,stop_name\n1,Teszt megálló\n",
    "routes.txt": "route_id,route_short_name\n1,1\n",
    "trips.txt": "trip_id,route_id\n1,1\n",
    "stop_times.txt": "trip_id,stop_id\n1,1\n",
  });
  const result = validateGtfsZip(buf);
  assert.equal(result.valid, true);
  assert.deepEqual(result.missingFiles, []);
});

test("hiányzó stop_times.txt esetén a validáció elutasítja, és megnevezi a hiányzó fájlt", () => {
  const buf = buildZip({
    "agency.txt": "agency_id,agency_name\n1,Teszt\n",
    "stops.txt": "stop_id,stop_name\n1,Teszt megálló\n",
    "routes.txt": "route_id,route_short_name\n1,1\n",
    "trips.txt": "trip_id,route_id\n1,1\n",
  });
  const result = validateGtfsZip(buf);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingFiles, ["stop_times.txt"]);
});

test("teljesen üres/nem-GTFS zip esetén minden kötelező fájl hiányzóként jelenik meg", () => {
  const buf = buildZip({ "readme.txt": "ez nem GTFS" });
  const result = validateGtfsZip(buf);
  assert.equal(result.valid, false);
  assert.equal(result.missingFiles.length, 5);
});

test("nem zip formátumú bemenet nem dob kivételt, hanem invalid eredményt ad", () => {
  const result = validateGtfsZip(Buffer.from("ez nem is zip fájl"));
  assert.equal(result.valid, false);
});

test("feed_info.txt jelenléte esetén a metaadatok (kiadó, verzió, érvényesség) kiolvasásra kerülnek", () => {
  const buf = buildZip({
    "agency.txt": "agency_id,agency_name\n1,Teszt\n",
    "stops.txt": "stop_id,stop_name\n1,Teszt megálló\n",
    "routes.txt": "route_id,route_short_name\n1,1\n",
    "trips.txt": "trip_id,route_id\n1,1\n",
    "stop_times.txt": "trip_id,stop_id\n1,1\n",
    "feed_info.txt":
      "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\n" +
      "Teszt Kiadó,http://example.com,hu,20260101,20261231,v1\n",
  });
  const result = validateGtfsZip(buf);
  assert.equal(result.valid, true);
  assert.equal(result.feedInfo?.feedPublisherName, "Teszt Kiadó");
  assert.equal(result.feedInfo?.feedVersion, "v1");
  assert.equal(result.feedInfo?.feedStartDate, "20260101");
});

test("hiányzó feed_info.txt nem teszi érvénytelenné a feltöltést (opcionális GTFS fájl)", () => {
  const buf = buildZip({
    "agency.txt": "agency_id,agency_name\n1,Teszt\n",
    "stops.txt": "stop_id,stop_name\n1,Teszt megálló\n",
    "routes.txt": "route_id,route_short_name\n1,1\n",
    "trips.txt": "trip_id,route_id\n1,1\n",
    "stop_times.txt": "trip_id,stop_id\n1,1\n",
  });
  const result = validateGtfsZip(buf);
  assert.equal(result.valid, true);
  assert.equal(result.feedInfo, undefined);
});
