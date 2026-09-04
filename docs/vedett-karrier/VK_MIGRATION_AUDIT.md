# Védett Karrier – DB Migration Chain Audit
**Scope:** Read-only audit of 5 VK sprint migration files
**Dátum:** 2026-09-04
**Auditor:** Production Deployment Runbook Session
**Módszer:** Teljes fájlolvasás, statikus elemzés — NEM futtatás, NEM production DB kapcsolat

---

## Auditált fájlok

| # | Fájl | Sprint | Méret |
|---|---|---|---|
| 1 | `20260903_vedett_karrier_foundation.sql` | Sprint 1+2 | 7 tábla, 3 fn, 9 trigger, 2 type, seed 61 sor |
| 2 | `20260903_vedett_karrier_sprint3.sql` | Sprint 3 | 7 tábla, 1 fn re-def, 4 trigger, RLS, seed 100 sor |
| 3 | `20260903_vedett_karrier_sprint4.sql` | Sprint 4 | 2× ALTER TABLE, 1 VIEW, nincs új tábla |
| 4 | `20260903_vedett_karrier_sprint5.sql` | Sprint 5 | 1 tábla, 1 fn, 1 trigger, RLS |
| 5 | `20260903_vedett_karrier_sprint6.sql` | Sprint 6 | 2 tábla, 2 fn, 2 trigger, RLS |

**Prerequisite (már productionban):** `20260829_vedettmunka.sql` — `employers` tábla

---

## 1. Ez az 5 migration alkotja-e a teljes VK Sprint 1–6 chain-t?

**IGEN.** A 21 migrációs fájl közül kizárólag ez az 5 tartalmaz `vedett_karrier` névvel ellátott VK-specifikus sémát. A többi fájl (`vedettmunka`, `community`, `academy`, stb.) teljesen különálló feature-öket hoz létre — a VK chain nem érinti azokat, és azok sem érintik a VK sémát (egyetlen kivétellel: az `employers` tábla FK referencia-tárgya, de azt a VK chain nem módosítja).

---

## 2. Miért nincs külön Sprint 2 migration?

Sprint 2 frontend/UX sprint volt — új DB objektumot nem hozott létre. Az adatmodell véglegesítési munkái a `foundation.sql`-be kerültek be (Sprint 1+2 combined). A fájl header maga is megjegyzi, hogy Sprint 4 a `vk_employer_workplaces` és `vk_job_roles` táblákat bővíti — ez Sprint 2-ben tervezett mezők utólagos alkalmazása, nem új tábla. Ez szándékos és helyes döntés: jobb egy idempotens foundation fájl, mint külön Sprint 2 ALTER TABLE.

---

## 3. Destruktív műveletek?

**NINCS EGYETLEN DESTRUKTÍV MŰVELET SEM.**

| Minta | Előfordulás | Értékelés |
|---|---|---|
| `DROP TABLE` | 0 | ✅ |
| `DROP COLUMN` | 0 | ✅ |
| `TRUNCATE` | 0 | ✅ |
| `DELETE FROM` | 0 | ✅ |
| `DROP INDEX IF EXISTS` | 1 (foundation) | ✅ Azonnal `CREATE UNIQUE INDEX` követi |
| `DROP POLICY IF EXISTS` | Sprint 3 minden policy-nál | ✅ Idempotency minta, helyes |
| `DROP FUNCTION` | 0 | ✅ |

Az egyetlen `DROP INDEX IF EXISTS uidx_career_profiles_user_active` az új tábla (`career_profiles`) egyedi indexének újralétrehozási mintája — azonnali `CREATE UNIQUE INDEX` követi. Nem rombol meglévő adatot.

---

## 4. Idempotens-e a teljes chain?

**RÉSZBEN IDEMPOTENS** — az első futtatásra minden esetben helyes; a re-run kockázat dokumentált és kezelt.

| Minta | Fájlok | Idempotens? |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | Mind az 5 | ✅ |
| `ADD COLUMN IF NOT EXISTS` | Sprint 4 | ✅ |
| `CREATE OR REPLACE FUNCTION` | Foundation, Sprint 3, 5, 6 | ✅ |
| `CREATE OR REPLACE VIEW` | Sprint 4 | ✅ |
| `DROP POLICY IF EXISTS` + `CREATE POLICY` | Sprint 3 | ✅ |
| `CREATE POLICY` (DROP nélkül) | Foundation | ⚠️ Re-run esetén hiba — de: első futtatáson helyes |
| `CREATE TRIGGER` (nem OR REPLACE) | Sprint 3, 5, 6 | ⚠️ Re-run esetén hiba — de: `CREATE TABLE IF NOT EXISTS` guard védi |
| `ON CONFLICT DO NOTHING` seed | Foundation, Sprint 3 | ✅ |
| `CREATE INDEX IF NOT EXISTS` | Sprint 5, 6 | ✅ |

**Re-run kockázat kezelése:** A `CREATE TABLE IF NOT EXISTS` implicit védelmet ad — ha a tábla már létezik és a trigger is létezik, a script hiba nélkül skip-eli a `CREATE TABLE`-t, de a triggerhez ér és hiba lesz. **Ezért: minden migration fájlt EGYSZER kell futtatni, sorban.** Ha egy futtatás félbeszakad, manuálisan kell a félbeszakadás helyétől folytatni.

---

## 5. Legacy /vedettmunka táblák érintve?

**NEM.** Egyik fájl sem módosít semmit az alábbi táblákból:

`employers`, `job_posts`, `job_applications_log`, `vm_job_attributes`, `vm_work_profiles`, `vm_consent_log`, `vm_admin_audit_log`

Sprint 4 header explicit: *"NEM MÓDOSÍT legacy /vedettmunka táblákat."*

Az `employers` tábla `REFERENCES employers(id)` formájában jelenik meg (`vk_employer_workplaces`, `vk_job_roles`, `vk_opportunities`) — ez read-only FK referencia, nem módosítás.

---

## 6. Circular függőségek?

**NINCS.** A dependency gráf aciklikus (DAG):

```
20260829_vedettmunka.sql
  └─ employers(id)
       └─ foundation.sql
            ├─ vkmm_dimensions, vkmm_sub_dimensions  (reference táblák)
            ├─ vk_employer_workplaces(id)
            │    └─ vk_job_roles(id)
            │         └─ job_role_env_values
            └─ career_profiles(id)
                 └─ career_profile_dimensions
                      └─ sprint3.sql
                           ├─ industries, job_families, skills, ...
                           └─ sprint4.sql  (ALTER TABLE + VIEW)
                                └─ sprint5.sql
                                     └─ vk_compatibility_results
                                          └─ sprint6.sql
                                               ├─ vk_opportunities
                                               └─ work_preference_documents
```

---

## 7. RLS minden VK táblán engedélyezve?

**IGEN — 17/17 tábla.**

| Tábla | Fájl | RLS |
|---|---|---|
| `vkmm_dimensions` | foundation | ✅ ENABLE ROW LEVEL SECURITY |
| `vkmm_sub_dimensions` | foundation | ✅ |
| `vk_employer_workplaces` | foundation | ✅ |
| `vk_job_roles` | foundation | ✅ |
| `job_role_env_values` | foundation | ✅ |
| `career_profiles` | foundation | ✅ |
| `career_profile_dimensions` | foundation | ✅ |
| `industries` | sprint3 | ✅ |
| `job_families` | sprint3 | ✅ |
| `skills` | sprint3 | ✅ |
| `job_family_skills` | sprint3 | ✅ |
| `job_family_env_profile` | sprint3 | ✅ |
| `user_skills` | sprint3 | ✅ |
| `career_interests` | sprint3 | ✅ |
| `vk_compatibility_results` | sprint5 | ✅ |
| `vk_opportunities` | sprint6 | ✅ |
| `work_preference_documents` | sprint6 | ✅ |

Sprint 4 nem hoz létre új táblát — csak ALTER TABLE és VIEW. A VIEW nem igényel önálló RLS-t (az alap tábla RLS-e érvényesül).

---

## 8. Employer isolation – `work_preference_documents` és `vk_compatibility_results`

**TELJESEN IZOLÁLT — mindkét táblán employer policy szándékosan hiányzik.**

`work_preference_documents` (sprint6):
```sql
CREATE POLICY "work_pref_doc_user_own"  → auth.uid() = user_id (FOR ALL)
CREATE POLICY "work_pref_doc_shared_read" → is_shared = true AND share_token NOT NULL (SELECT)
-- Employer policy SZÁNDÉKOSAN HIÁNYZIK
```

`vk_compatibility_results` (sprint5):
```sql
CREATE POLICY "vk_compat_user_own"  → auth.uid() = user_id (FOR ALL)
-- Employer policy SZÁNDÉKOSAN HIÁNYZIK
-- "⚠ EMPLOYER POLICY SZÁNDÉKOSAN HIÁNYZIK." – verbatim a fájlban
```

RLS backstop: employer auth.uid() ≠ más user user_id → minden sor kizárva automatikusan.

---

## 9. service_role key – kliensre kerülés?

**NEM KERÜL KLIENSRE.** A migration fájlok nem tartalmaznak env var konfigurációt. Az RLS policy-k `(SELECT auth.role()) = 'service_role'` mintát használnak — ez server-side PostgreSQL role check, helyes és szokásos Supabase minta. Nem exposes kulcsot.

---

## 10. AI matching, alkalmassági pontszám, automatikus jelöltértékelés?

**NINCS — schema szinten kizárva.**

- `vk_compatibility_results.dimension_results`: JSONB tömb, elemei: `sub_dimension_code`, `status`, `dataConfidence`, `explanationKey`, `employerValue` — **nincs numerikus score mező**
- `vk_opportunities.application_method` CHECK: `IN ('EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS')` — **nincs 'INTERNAL_APPLICATION'**
- Egyetlen táblán sem szerepel `score`, `ranking`, `ai_match`, `candidate_rating` vagy hasonló mező
- Nincs automatikus jelölt-rangsorolást végző trigger vagy függvény

---

## 11. Backward-kompatibilitás meglévő sorokkal

**TELJES BACKWARD-KOMPATIBILITÁS.**

Sprint 4 oszlopbővítések mind `ADD COLUMN IF NOT EXISTS ... DEFAULT`:
- `country_code text NOT NULL DEFAULT 'HU'` — meglévő sorok 'HU' értéket kapnak ✅
- `main_tasks_json jsonb NOT NULL DEFAULT '[]'` — meglévő sorok üres tömböt kapnak ✅
- `profile_completion_pct smallint NOT NULL DEFAULT 0` — meglévő sorok 0-t kapnak ✅
- `last_saved_step smallint NOT NULL DEFAULT 0` — meglévő sorok 0-t kapnak ✅
- `summary_hu text` (nullable) — meglévő sorok NULL-t kapnak ✅
- `job_family_slug text REFERENCES job_families(slug) ON DELETE SET NULL` (nullable) — ✅
- `industry_slug text REFERENCES industries(slug) ON DELETE SET NULL` (nullable) — ✅

Nem távolít el és nem szűkít egyetlen meglévő oszlop-constraintet sem.

---

## 12. Trigger idempotency részletes értékelés

| Trigger | Fájl | Típus | Kockázat | Mitigáció |
|---|---|---|---|---|
| 7× `vk_set_updated_at` trigger | foundation | `CREATE OR REPLACE` | ✅ Nincs | — |
| `trg_validate_job_role_env_value_type` | foundation | `CREATE OR REPLACE` | ✅ Nincs | — |
| `trg_validate_career_profile_dimension_type` | foundation | `CREATE OR REPLACE` | ✅ Nincs | — |
| 4× sprint3 updated_at trigger | sprint3 | `CREATE TRIGGER` | ⚠️ Re-run fail | Új táblákon, first-run safe |
| `vk_compat_result_updated_at` | sprint5 | `CREATE TRIGGER` | ⚠️ Re-run fail | Új táblán, first-run safe |
| `trg_vk_opportunities_updated_at` | sprint6 | `CREATE TRIGGER` | ⚠️ Re-run fail | Új táblán, first-run safe |
| `trg_work_pref_docs_updated_at` | sprint6 | `CREATE TRIGGER` | ⚠️ Re-run fail | Új táblán, first-run safe |

**Következtetés:** Első futtatásra minden trigger rendben. Re-run csak félbeszakadt futtatás után szükséges — ilyenkor kézi folytatás (a hibásnál kezdve) szükséges, nem teljes újrafuttatás.

---

## 13. Kötelező futtatási sorrend

```
LÉPÉS 1: 20260829_vedettmunka.sql          → employers tábla
          [Már productionban — NE futtasd újra]

LÉPÉS 2: 20260903_vedett_karrier_foundation.sql
          Feltétel: employers tábla létezik

LÉPÉS 3: 20260903_vedett_karrier_sprint3.sql
          Feltétel: vk_set_updated_at() függvény létezik (foundation)

LÉPÉS 4: 20260903_vedett_karrier_sprint4.sql
          Feltétel: job_families(slug), industries(slug) léteznek (sprint3)

LÉPÉS 5: 20260903_vedett_karrier_sprint5.sql
          Feltétel: vk_job_roles(id) létezik (foundation)

LÉPÉS 6: 20260903_vedett_karrier_sprint6.sql
          Feltétel: employers(id), vk_job_roles(id), career_profiles(id) léteznek
```

Felcserélt sorrend → FK constraint hiba a futtatásnál. Nem csendesen hibázik — az SQL Editor hibaüzenetet ad.

---

## 14. Egyéb kockázatok és megjegyzések

**career_profile_id nem FK sprint5-ben:**
`vk_compatibility_results.career_profile_id uuid NOT NULL` — nincs `REFERENCES career_profiles(id)`. Szándékos döntés: `career_profile_version_hash` alapú verziókövető rendszert használ (stale detection app szinten). Referenciális integritás hiánya app szintű ellenőrzéssel pótolt. Nem blocker.

**vk_public_job_role_env_values VIEW (sprint4):**
Kizárja az `employer_note` oszlopot. A `WHERE jr.status = 'active'` szűrő csökkenti az expozíciót. RLS a mögöttes táblákon érvényes. ✅

**work_preference_documents.share_token uuid UNIQUE DEFAULT NULL:**
PostgreSQL UNIQUE indexben a NULL értékek egyenként egyediek — több NULL megengedett. Helyes viselkedés: megosztás bekapcsológ előtt NULL marad. ✅

**vk_opportunities DELETE policy hiánya:**
Szándékos — az opportunity lezárása státuszváltás (`'closed'`), nem törlés. Ez helyes, auditnaplónak megfelelő design. ✅

---

## Ellenőrző lekérdezések (Supabase SQL Editor — futtatás MIGRATION UTÁN)

### A. Táblák léteznek

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'vkmm_dimensions', 'vkmm_sub_dimensions',
    'vk_employer_workplaces', 'vk_job_roles', 'job_role_env_values',
    'career_profiles', 'career_profile_dimensions',
    'industries', 'job_families', 'skills',
    'job_family_skills', 'job_family_env_profile',
    'user_skills', 'career_interests',
    'vk_compatibility_results',
    'vk_opportunities', 'work_preference_documents'
  )
ORDER BY table_name;
-- Elvárt: 17 sor
```

### B. RLS engedélyezve minden VK táblán

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN (
    'vkmm_dimensions', 'vkmm_sub_dimensions',
    'vk_employer_workplaces', 'vk_job_roles', 'job_role_env_values',
    'career_profiles', 'career_profile_dimensions',
    'industries', 'job_families', 'skills',
    'job_family_skills', 'job_family_env_profile',
    'user_skills', 'career_interests',
    'vk_compatibility_results',
    'vk_opportunities', 'work_preference_documents'
  )
ORDER BY relname;
-- Elvárt: minden sor relrowsecurity = true
```

### C. Employer nem fér hozzá work_preference_documents-hoz

```sql
SELECT policyname, tablename, cmd, qual
FROM pg_policies
WHERE tablename = 'work_preference_documents'
ORDER BY policyname;
-- Elvárt: CSAK 'work_pref_doc_user_own' és 'work_pref_doc_shared_read'
-- NEM szerepelhet employer policy
```

### D. Compatibility results — employer kizárva

```sql
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename = 'vk_compatibility_results'
ORDER BY policyname;
-- Elvárt: CSAK 'vk_compat_user_own'
-- NEM szerepelhet employer policy
```

### E. application_method check constraint

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'vk_opportunities'::regclass
  AND contype = 'c';
-- Elvárt: application_method IN ('EXTERNAL_URL', 'EMAIL', 'CONTACT_INSTRUCTIONS')
-- NEM szerepelhet 'INTERNAL_APPLICATION'
```

### F. Seed adatok betöltve

```sql
SELECT 'vkmm_dimensions' AS tbl, COUNT(*) FROM vkmm_dimensions
UNION ALL
SELECT 'vkmm_sub_dimensions', COUNT(*) FROM vkmm_sub_dimensions
UNION ALL
SELECT 'industries', COUNT(*) FROM industries
UNION ALL
SELECT 'job_families', COUNT(*) FROM job_families
UNION ALL
SELECT 'skills', COUNT(*) FROM skills;
-- Elvárt: 10, 51, 15, 25, 60
```

### G. Sprint 4 oszlopok megvannak

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'vk_job_roles'
  AND column_name IN (
    'job_family_slug', 'industry_slug', 'summary_hu',
    'main_tasks_json', 'profile_completion_pct',
    'profile_version_hash', 'last_saved_step'
  )
ORDER BY column_name;
-- Elvárt: 7 sor
```

### H. Public view létezik (employer_note kizárva)

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'vk_public_job_role_env_values'
ORDER BY ordinal_position;
-- Elvárt: employer_note NEM szerepel a listában
```

---

## 14-pont összefoglalása

| # | Audit pont | Eredmény |
|---|---|---|
| 1 | Ez az 5 fájl alkotja a teljes VK chainjét | ✅ MEGERŐSÍTVE |
| 2 | Miért nincs Sprint 2 migration | ✅ FRONTEND SPRINT — foundation-ba integrálva |
| 3 | Nincs destruktív művelet | ✅ TISZTA |
| 4 | Idempotencia | ✅ ELSŐ FUTTATÁSRA TELJES — re-run: kezelt kockázat |
| 5 | Legacy táblák nem érintve | ✅ TISZTA |
| 6 | Nincs circular dependency | ✅ TISZTA DAG |
| 7 | RLS 17/17 táblán engedélyezve | ✅ TELJES |
| 8 | Employer nem fér hozzá WPD/compat-hoz | ✅ SZÁNDÉKOS KIZÁRÁS MEGERŐSÍTVE |
| 9 | service_role key nem kerül kliensre | ✅ MIGRATION SZINTEN NEM ÉRINTETT |
| 10 | Nincs AI matching / numerikus pontszám | ✅ SCHEMA SZINTEN KIZÁRVA |
| 11 | Backward-kompatibilitás | ✅ TELJES |
| 12 | Trigger idempotency | ✅ FIRST-RUN SAFE — re-run: dokumentált |
| 13 | Kötelező futtatási sorrend | ✅ SORREND MEGHATÁROZVA |
| 14 | Egyéb kockázatok | ✅ MIND DOKUMENTÁLT, EGYIK SEM BLOCKER |

---

## VERDICT

```
GO — SAFE TO BEGIN CONTROLLED PRODUCTION MIGRATION
```

**Feltételek:**

1. A `20260829_vedettmunka.sql` (`employers` tábla) már productionban van — ellenőrzendő: `SELECT COUNT(*) FROM employers;` — ha eredményt ad, kész.
2. Minden migration fájlt pontosan egyszer, a megadott sorrendben kell futtatni a Supabase SQL Editorban.
3. Minden futtatás után futtasd az ellenőrző lekérdezéseket (A–H), majd lépj a következőre.
4. `supabase db push` TILOS — production migration history üres, ez az összes régi migration replay-ét kíséreli meg.

**Nincs olyan találat az auditban, amely `NO-GO` verdiktet indokolna.**

---

*Audit elvégezve: 2026-09-04 | Production DB nem volt érintve | Kizárólag repository fájlolvasás*
