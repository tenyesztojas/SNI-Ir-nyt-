// Védett Család – tulajdonjog-átadás VALÓDI párhuzamossági tesztje két külön kapcsolattal.
// KIZÁRÓLAG helyi, eldobható PostgreSQL-en: a family_ownership_handover tesztcsomag lefutása
// után, ugyanabban az adatbázisban (a fo.* segédeket használja).
//   PGSOCK=<unix socket könyvtár> node family_ownership_handover_concurrency.mjs <adatbázis> [port]
// Biztonsági őr: csak unix socketen fut, és csak a stub auth.users (<= 2 oszlop) mellett.
import pg from "pg";
import assert from "node:assert/strict";

const [dbname, port = "55432"] = process.argv.slice(2);
const host = process.env.PGSOCK;
if (!host || !host.startsWith("/") || !dbname) {
  console.error("Használat: PGSOCK=/socket/konyvtar node family_ownership_handover_concurrency.mjs <db> [port] (csak helyi unix socket)");
  process.exit(2);
}
const cfg = { host, port: Number(port), user: "postgres", database: dbname };
const admin = new pg.Client(cfg);
await admin.connect();
const guard = await admin.query(
  "select (select count(*) from information_schema.columns where table_schema='auth' and table_name='users') <= 2 " +
  "and to_regnamespace('fo') is not null and to_regnamespace('supabase_migrations') is null as ok");
if (!guard.rows[0].ok) { console.error("Nem eldobható tesztadatbázis – leállás"); process.exit(3); }

// Előkészítés: új család egy ownerrel és két aktív gondviselővel.
const ids = (await admin.query(`
  select fo.mkuser('co') o, fo.mkuser('cg1') g1, fo.mkuser('cg2') g2`)).rows[0];
async function asUser(c, u) {
  await c.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', (select email from auth.users where id = $1::uuid), false)", [u]);
}
await admin.query("update public.profiles set pilot_access = array['family_db_beta'] where id = $1", [ids.o]);
await asUser(admin, ids.o);
const fam = (await admin.query("select public.create_family_with_owner('Párhuzamos') id")).rows[0].id;
await admin.query("select public.start_family_trial($1)", [fam]);
for (const g of [ids.g1, ids.g2]) {
  await asUser(admin, ids.o);
  await admin.query("select public.invite_family_guardian($1, (select email from auth.users where id = $2))", [fam, g]);
  assert.equal((await admin.query("select fo.accept($1, $2) r", [g, fam])).rows[0].r, "ok");
}

async function session(u) {
  const c = new pg.Client(cfg); await c.connect();
  await asUser(c, u);
  await c.query("begin"); await c.query("set local role authenticated");
  return c;
}
const owners = async () => (await admin.query(
  "select count(*)::int n from public.family_members where family_id = $1 and role = 'owner' and status = 'active'", [fam])).rows[0].n;

// P1: két egyidejű átadás ugyanattól az ownertől különböző célszemélyeknek.
const s1 = await session(ids.o);
const s2 = await session(ids.o);
await s1.query("select public.handover_family_ownership($1, $2)", [fam, ids.g1]); // zárat tart, nincs commit
let s2Done = false;
const p2 = s2.query("select public.handover_family_ownership($1, $2)", [fam, ids.g2])
  .then(() => "ok", (e) => `ERR:${e.code}:${e.hint ?? ""}`).finally(() => { s2Done = true; });
await new Promise((r) => setTimeout(r, 700));
assert.equal(s2Done, false, "P1a a második átadás vár a családonkénti zárra");
await s1.query("commit");
const r2 = await p2; await s2.query("rollback").catch(() => {});
assert.equal(r2, "ERR:P0001:family_not_owner", "P1b a második átadás a zár után elutasítva (a hívó már nem owner)");
assert.equal(await owners(), 1, "P1c pontosan egy owner");
const roleOf = async (u) => (await admin.query("select role from public.family_members where family_id = $1 and user_id = $2", [fam, u])).rows[0].role;
assert.equal(await roleOf(ids.g1), "owner"); assert.equal(await roleOf(ids.o), "guardian"); assert.equal(await roleOf(ids.g2), "guardian");

// P2: egyidejű átadás (g1 -> g2) és a célszemély eltávolítása (g1 eltávolítja g2-t) — sorba rendeződnek.
const s3 = await session(ids.g1);
const s4 = await session(ids.g1);
await s3.query("select public.handover_family_ownership($1, $2)", [fam, ids.g2]);
let s4Done = false;
const p4 = s4.query("select public.remove_family_member($1, $2)", [fam, ids.g2])
  .then(() => "ok", (e) => `ERR:${e.code}:${e.hint ?? ""}`).finally(() => { s4Done = true; });
await new Promise((r) => setTimeout(r, 700));
assert.equal(s4Done, false, "P2a az eltávolítás vár");
await s3.query("commit");
const r4 = await p4; await s4.query("rollback").catch(() => {});
assert.equal(r4, "ERR:P0001:family_not_owner", "P2b az eltávolítás a zár után elutasítva");
assert.equal(await owners(), 1, "P2c pontosan egy owner");
assert.equal(await roleOf(ids.g2), "owner");

for (const c of [s1, s2, s3, s4]) await c.end().catch(() => {});
await admin.end();
console.log("family_ownership_handover_concurrency: P1-P2 OK");
