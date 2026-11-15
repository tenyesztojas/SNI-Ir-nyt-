// Regresszió: a family_members → profiles beágyazás legyen egyértelmű.
//
// A 20261103000000_family_member_removal.sql óta a family_members táblának
// KÉT idegen kulcsa mutat a profiles táblára (user_id és revoked_by). Ilyenkor
// a PostgREST a jelöletlen `profiles(...)` beágyazást PGRST201 hibával
// („more than one relationship was found”) elutasítja, és a /csalad oldal
// „Nem sikerült betölteni a családi adatokat.” üzenetet mutat (147. lépés).
// Ez a teszt statikus forráselemzés: nem kapcsolódik Supabase-hez, nem ír adatot.
//   node --test --experimental-strip-types __tests__/family/family-members-profile-embed.test.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Minden `.from("family_members")` utáni első `.select(...)` argumentuma.
function familyMembersSelects(src: string): string[] {
  const res: string[] = [];
  const fromRe = /\.from\(\s*["'`]family_members["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src))) {
    const rest = src.slice(m.index + m[0].length);
    const nextFrom = rest.search(/\.from\(/);
    const scope = nextFrom === -1 ? rest : rest.slice(0, nextFrom);
    const sel = scope.match(/\.select\(\s*(["'`])([\s\S]*?)\1/);
    if (sel) res.push(sel[2]);
  }
  return res;
}

const MIGRATIONS = "supabase/migrations";
const profileFkColumns = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .flatMap((f) => {
    const sql = read(join(MIGRATIONS, f));
    const cols: string[] = [];
    // `create table public.family_members ( ... )` inline hivatkozásai
    const create = sql.match(/create table[^(]*public\.family_members\s*\(([\s\S]*?)\n\);/i);
    if (create) {
      for (const line of create[1].split("\n")) {
        const c = line.match(/^\s*(\w+)\s+uuid\b.*references\s+public\.profiles\b/i);
        if (c) cols.push(c[1]);
      }
    }
    // `alter table public.family_members add column ... references public.profiles`
    const alterRe = /alter table[^;]*public\.family_members[^;]*?add column(?: if not exists)?\s+(\w+)\s+uuid[^;]*?references\s+public\.profiles\b/gi;
    let a: RegExpExecArray | null;
    while ((a = alterRe.exec(sql))) cols.push(a[1]);
    return cols;
  });

describe("family_members → profiles beágyazás", () => {
  test("a migrációk szerint több profiles-FK van (ezért kell a jelölés)", () => {
    assert.ok(profileFkColumns.includes("user_id"), "user_id → profiles FK hiányzik");
    assert.ok(profileFkColumns.includes("revoked_by"), "revoked_by → profiles FK hiányzik");
    assert.ok(new Set(profileFkColumns).size >= 2);
  });

  test("getMyFamilies az explicit user_id FK-val ágyazza be a profilt", () => {
    const src = read("lib/family/data.ts");
    assert.match(
      src,
      /\.select\("family_id, user_id, role, profiles!family_members_user_id_fkey\(display_name\)"\)/
    );
  });

  test("sehol nincs jelöletlen profiles(...) beágyazás family_members lekérdezésben", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of [...walk("lib"), ...walk("app")]) {
      for (const sel of familyMembersSelects(read(file))) {
        checked++;
        if (/(^|[\s,(])profiles\s*\(/.test(sel)) offenders.push(`${file}: ${sel}`);
      }
    }
    assert.ok(checked > 0, "nem talált family_members select-et — a kereső elromlott");
    assert.deepEqual(offenders, []);
  });

  test("a kereső felismeri a hibás mintát (önellenőrzés)", () => {
    const bad = `x.from("family_members").select("family_id, profiles(display_name)")`;
    const good = `x.from("family_members").select("family_id, profiles!family_members_user_id_fkey(display_name)")`;
    assert.match(familyMembersSelects(bad)[0], /(^|[\s,(])profiles\s*\(/);
    assert.doesNotMatch(familyMembersSelects(good)[0], /(^|[\s,(])profiles\s*\(/);
  });
});
