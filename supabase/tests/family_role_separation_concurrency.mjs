// Védett Család – gyermekfiók / gondviselő szerepütközés VALÓDI párhuzamossági tesztje.
// KIZÁRÓLAG helyi, eldobható PostgreSQL-en, a family_role_separation csomag lefutása után,
// ugyanabban az adatbázisban (a fs.* segédeket használja).
//   PGSOCK=<unix socket könyvtár> node family_role_separation_concurrency.mjs <adatbázis> [port]
// Biztonsági őr: csak unix socketen, csak a stub auth.users (<= 2 oszlop) mellett fut.
import pg from "pg";
import assert from "node:assert/strict";

const [dbname, port = "55432"] = process.argv.slice(2);
const host = process.env.PGSOCK;
if (!host || !host.startsWith("/") || !dbname) {
  console.error("Használat: PGSOCK=/socket/konyvtar node family_role_separation_concurrency.mjs <db> [port] (csak helyi unix socket)");
  process.exit(2);
}
const cfg = { host, port: Number(port), user: "postgres", database: dbname };
const admin = new pg.Client(cfg);
await admin.connect();
const guard = await admin.query(
  "select (select count(*) from information_schema.columns where table_schema='auth' and table_name='users') <= 2 " +
  "and to_regnamespace('fs') is not null and to_regnamespace('supabase_migrations') is null as ok");
if (!guard.rows[0].ok) { console.error("Nem eldobható tesztadatbázis – leállás"); process.exit(3); }

const one = async (sql, params = []) => (await admin.query(sql, params)).rows[0];
const owner = (await one("select fs.id('b') id")).id; // B család ownere (béta)
const fam = (await one("select fs.id('fb') id")).id;
// B családot próbaidőre tesszük (több felnőtt hely), és két új gyermeket veszünk fel.
await one("select fs.as_user($1)", [owner]);
await admin.query("select public.start_family_trial($1)", [fam]).catch(() => null);
const kids = [];
for (const n of ["pc1", "pc2"]) {
  await one("select fs.as_user($1)", [owner]);
  kids.push((await one("select public.create_child_profile_for_family($1, $2, null) id", [fam, n])).id);
}

async function session(u) {
  const c = new pg.Client(cfg); await c.connect();
  await c.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', (select email from auth.users where id = $1::uuid), false)", [u]);
  await c.query("begin"); await c.query("set local role authenticated");
  return c;
}
const asErr = (e) => `ERR:${e.code}:${e.hint ?? ""}`;
async function prepareUser(name, kid) {
  const u = (await one("select fs.mkuser($1) id", [name])).id;
  await one("select fs.as_user($1)", [owner]);
  const inv = (await one("select public.invite_family_guardian($1, $2) id", [fam, `${name}@example.invalid`])).id;
  const token = (await one("select fs.child_token($1, $2) t", [owner, kid])).t;
  return { u, inv, token };
}
const memberStatus = async (u) => (await one("select status from public.family_members where family_id = $1 and user_id = $2", [fam, u]))?.status ?? null;
const childLinks = async (u) => (await one("select count(*)::int n from public.child_accounts where auth_user_id = $1 and status <> 'revoked'", [u])).n;

// Q1: előbb a gondviselői elfogadás (nyitott tranzakció), közben gyermekfiók-kapcsolás.
{
  const p = await prepareUser("q1", kids[0]);
  const s1 = await session(p.u); const s2 = await session(p.u);
  await s1.query("select public.accept_family_guardian_invitation($1)", [p.inv]);
  let done = false;
  const r2p = s2.query("select public.accept_child_account_invitation($1)", [p.token]).then(() => "ok", asErr).finally(() => { done = true; });
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(done, false, "Q1a a gyermekfiók-kapcsolás vár a felhasználói zárra");
  await s1.query("commit");
  const r2 = await r2p; await s2.query("rollback").catch(() => {});
  assert.equal(r2, "ERR:P0001:family_child_account_conflict", "Q1b a kapcsolás elutasítva");
  assert.equal(await memberStatus(p.u), "active"); assert.equal(await childLinks(p.u), 0, "Q1c nincs kettős szerep");
  await s1.end(); await s2.end();
}
// Q2: előbb a gyermekfiók-kapcsolás (nyitott tranzakció), közben gondviselői elfogadás.
{
  const p = await prepareUser("q2", kids[1]);
  const s1 = await session(p.u); const s2 = await session(p.u);
  await s1.query("select public.accept_child_account_invitation($1)", [p.token]);
  let done = false;
  const r2p = s2.query("select public.accept_family_guardian_invitation($1)", [p.inv]).then(() => "ok", asErr).finally(() => { done = true; });
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(done, false, "Q2a a gondviselői elfogadás vár");
  await s1.query("commit");
  const r2 = await r2p; await s2.query("rollback").catch(() => {});
  assert.equal(r2, "ERR:P0001:family_child_account_conflict", "Q2b az elfogadás elutasítva");
  assert.equal(await memberStatus(p.u), null); assert.equal(await childLinks(p.u), 1, "Q2c nincs kettős szerep");
  await s1.end(); await s2.end();
}
await admin.end();
console.log("family_role_separation_concurrency: Q1-Q2 OK");
