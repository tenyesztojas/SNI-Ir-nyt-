// SNI Iránytű — egyszeri geokódoló script (5. fázis: térkép).
//
// Mit csinál: lekéri a helyek cím-adatait KÖZVETLENÜL a Supabase
// adatbázisból (a .env.local-ban beállított projektből — nem a
// supabase/seed.sql fájlból, mert az idővel elavulhat / kevesebb helyet
// tartalmazhat, mint amennyi valójában fel van töltve az élő adatbázisba),
// lekéri a koordinátáikat az OpenStreetMap Nominatim API-jától (ingyenes,
// kulcs nélkül használható), és egy kész SQL fájlt ír ki
// (supabase/update_coordinates.sql), amit a Supabase SQL Editorban kell
// lefuttatni — pontosan úgy, mint a schema.sql / seed.sql esetén.
// FONTOS: az SQL Editorban a jobb felső "Role" legördülő legyen "postgres"
// (ne "anon") az UPDATE futtatásakor, különben az RLS miatt 0 sor módosul,
// hibaüzenet nélkül.
//
// Csak azokat a helyeket geokódolja, amelyeknek MÉG NINCS koordinátája
// (latitude vagy longitude null) — a már meglévőket nem kérdezi le újra.
//
// Futtatás (a projekt gyökeréből, ott ahol az internet-hozzáférés megvan —
// tehát a saját géped, NEM a Claude sandbox):
//   node scripts/geocode-places.mjs
//
// A Nominatim használati szabályzata max. 1 kérés/másodpercet enged, ezért a
// script szándékosan lassú (kb. 1 másodperc/hely) — ezt nem kell siettetni.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const outPath = path.join(__dirname, "..", "supabase", "update_coordinates.sql");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// A Nominatim megköveteli egy azonosító User-Agentet / contact infót.
const USER_AGENT = "SNI-Iranytu-geocoder/1.0 (holvay.csaba@gmail.com)";
const DELAY_MS = 1100; // max. 1 kérés / másodperc — légy ennél is óvatosabb.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadSupabaseEnv() {
  let raw;
  try {
    raw = await readFile(envPath, "utf8");
  } catch {
    throw new Error(
      `Nem találom a .env.local fájlt (${envPath}). Hozd létre a .env.local.example alapján, és töltsd ki a Supabase URL-t/kulcsot.`
    );
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "A .env.local-ban hiányzik a NEXT_PUBLIC_SUPABASE_URL vagy NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function fetchPlacesNeedingGeocode({ url, key }) {
  const endpoint =
    `${url}/rest/v1/places?select=slug,city,postal_code,address,latitude,longitude` +
    `&or=(latitude.is.null,longitude.is.null)&order=slug`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST API HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function geocode(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=hu`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

async function main() {
  const supabaseEnv = await loadSupabaseEnv();
  const places = await fetchPlacesNeedingGeocode(supabaseEnv);

  if (places.length === 0) {
    console.log("Minden helynek van már koordinátája az adatbázisban — nincs teendő.");
    return;
  }

  console.log(`${places.length} olyan helyet találtam az adatbázisban, amelynek még nincs koordinátája.\n`);

  const updates = [];
  const failed = [];

  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    // Pontatlanul ismert helyszínek esetén ("pontos cím ellenőrizendő" stb.)
    // a város/irányítószám alapján próbálkozunk, nem a teljes (megbízhatatlan)
    // address mezővel.
    const addressLooksVague = /ellenőrizendő|egyeztetéssel|nem publikus|környéke/i.test(p.address || "");
    const query = !addressLooksVague && p.address
      ? p.address
      : `${p.postal_code ?? ""} ${p.city ?? ""}`.trim();

    process.stdout.write(`[${i + 1}/${places.length}] ${p.slug} (${query}) ... `);
    try {
      const result = await geocode(query);
      if (result) {
        updates.push({ slug: p.slug, ...result });
        console.log(`OK (${result.lat}, ${result.lon})`);
      } else {
        failed.push(p);
        console.log("NINCS EREDMÉNY");
      }
    } catch (err) {
      failed.push(p);
      console.log(`HIBA: ${err.message}`);
    }
    if (i < places.length - 1) await sleep(DELAY_MS);
  }

  const lines = [
    "-- SNI Iránytű — geokódolt koordináták (automatikusan generálva)",
    "-- Futtatás: Supabase SQL Editor, a Role legördülő legyen \"postgres\" (ne \"anon\").",
    "",
    ...updates.map(
      (u) =>
        `update public.places set latitude = ${u.lat}, longitude = ${u.lon} where slug = '${u.slug}';`
    ),
    "",
  ];
  await writeFile(outPath, lines.join("\n"), "utf8");

  console.log(`\nKész: ${updates.length}/${places.length} hely koordinátája megvan.`);
  console.log(`Kiírva: ${outPath}`);

  if (failed.length > 0) {
    console.log(
      `\n${failed.length} helyhez nem talált koordinátát automatikusan — ezeket kézzel kell pótolni (pl. Google Maps-en jobb klikk -> koordináták kimásolása), majd egy ehhez hasonló "update" sorral az update_coordinates.sql fájl végére fűzve:\n`
    );
    failed.forEach((p) => console.log(`  - ${p.slug}: ${p.address}`));
  }
}

main().catch((err) => {
  console.error("Váratlan hiba:", err);
  process.exit(1);
});
