// supabase/migrations/20260907_rest_points.sql — RLS "policy shape" ellenőrzés.
//
// FONTOS: ez NEM egy éles adatbázison futó integrációs teszt (nincs live
// Supabase/DB ebben a futtatási környezetben) — ez egy STATIKUS,
// szöveg-alapú ellenőrzés arról, hogy a migrációs SQL fájl ténylegesen
// tartalmazza a N. pont ("Supabase RLS") által megkövetelt policy-kat és
// azok created_by = auth.uid() feltételét minden CRUD műveletre.
// Az éles cross-user tiltás tényleges live-DB bizonyítása külön,
// felhasználó által futtatott script/manuális teszt feladata.
//
//   node --test __tests__/rest-points/rls-policy.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260907_rest_points.sql"
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

test("a migráció fájl létezik", () => {
  assert.equal(fs.existsSync(MIGRATION_PATH), true);
});

test("RLS engedélyezve van a rest_points táblán", () => {
  const sql = readMigration();
  assert.match(sql, /ALTER TABLE rest_points ENABLE ROW LEVEL SECURITY/i);
});

test("SELECT policy létezik és created_by = auth.uid()-ra korlátoz", () => {
  const sql = readMigration();
  const match = sql.match(/CREATE POLICY[^;]*FOR SELECT[^;]*;/is);
  assert.ok(match, "nem található SELECT policy");
  assert.match(match![0], /created_by\s*=\s*auth\.uid\(\)/);
});

test("INSERT policy létezik és WITH CHECK created_by = auth.uid()", () => {
  const sql = readMigration();
  const match = sql.match(/CREATE POLICY[^;]*FOR INSERT[^;]*;/is);
  assert.ok(match, "nem található INSERT policy");
  assert.match(match![0], /WITH CHECK\s*\(\s*created_by\s*=\s*auth\.uid\(\)\s*\)/);
});

test("UPDATE policy létezik, USING és WITH CHECK is created_by = auth.uid()", () => {
  const sql = readMigration();
  const match = sql.match(/CREATE POLICY[^;]*FOR UPDATE[^;]*;/is);
  assert.ok(match, "nem található UPDATE policy");
  const clause = match![0];
  assert.match(clause, /USING\s*\(\s*created_by\s*=\s*auth\.uid\(\)\s*\)/);
  assert.match(clause, /WITH CHECK\s*\(\s*created_by\s*=\s*auth\.uid\(\)\s*\)/);
});

test("DELETE policy létezik és USING created_by = auth.uid()", () => {
  const sql = readMigration();
  const match = sql.match(/CREATE POLICY[^;]*FOR DELETE[^;]*;/is);
  assert.ok(match, "nem található DELETE policy");
  assert.match(match![0], /USING\s*\(\s*created_by\s*=\s*auth\.uid\(\)\s*\)/);
});

test("nincs 'más is láthatja' / public SELECT policy PRIVATE ponthoz", () => {
  const sql = readMigration();
  // Csak egyetlen SELECT policy szabad legyen jelen ebben a sprintben.
  const selectPolicyCount = (sql.match(/FOR SELECT/gi) || []).length;
  assert.equal(selectPolicyCount, 1);
});

test("visibility CHECK constraint ebben a sprintben PRIVATE-ra korlátoz", () => {
  const sql = readMigration();
  assert.match(sql, /CHECK\s*\(\s*visibility\s*=\s*'PRIVATE'\s*\)/);
});

test("source CHECK constraint ebben a sprintben USER-re korlátoz", () => {
  const sql = readMigration();
  assert.match(sql, /CHECK\s*\(\s*source\s*=\s*'USER'\s*\)/);
});

test("koordináta tartomány constraint jelen van (latitude/longitude)", () => {
  const sql = readMigration();
  assert.match(sql, /latitude\s+BETWEEN\s+-90\s+AND\s+90/i);
  assert.match(sql, /longitude\s+BETWEEN\s+-180\s+AND\s+180/i);
});

test("created_by NOT NULL és auth.users(id) FK-ra hivatkozik", () => {
  const sql = readMigration();
  assert.match(sql, /created_by\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)/i);
});
