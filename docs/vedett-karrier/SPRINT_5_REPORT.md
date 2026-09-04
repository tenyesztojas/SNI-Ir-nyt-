# Védett Karrier – Sprint 5 Report

**Dátum:** 2026-09-03
**Sprint:** 5 – COMPATIBILITY ENGINE + KOMPATIBILITÁSI TÉRKÉP
**Verdict:** ✅ GO FOR SPRINT 6

---

## 1. Executive Summary

A Sprint 5 implementálta a Compatibility Engine-t és a Kompatibilitási Térkép route-ot. A rendszer determinisztikusan összehasonlítja a felhasználó saját Munkaprofilját és egy aktív munkakör VKMM értékeit – 5 lezárt comparison handler alapján. Nincs AI, nincs alkalmassági score, nincs rangsor.

---

## 2. Compatibility Architecture

```
lib/vedett-karrier/compatibility/
  handlers.ts      # 5 pure comparison handler + ExplKey + applyImportanceEscalation
  engine.ts        # computeCompatibility() + buildCompatibilitySummary() orchestration
  data.ts          # DB: loadCompatibilityResult, isResultStale, upsertCompatibilityResult

app/vedett-karrier/kompatibilitas/[jobRoleId]/
  actions.ts       # 'use server' – computeAndSaveCompatibility()
  page.tsx         # Server Component – auto-compute + render

supabase/migrations/
  20260903_vedett_karrier_sprint5.sql   # vk_compatibility_results + RLS
```

---

## 3. Comparison Handlers

| Handler | Comparison Type | File |
|---------|----------------|------|
| `handleHI` | HIGHER_IS_MORE_DEMANDING | `handlers.ts` |
| `handleRP` | RANGE_PREFERENCE | `handlers.ts` |
| `handleSM` | SET_MEMBERSHIP | `handlers.ts` |
| `handleBP` | BOOLEAN_PREFERENCE | `handlers.ts` |
| `handleFR` | FREQUENCY_RANGE | `handlers.ts` |

Minden handler pure function: nincs DB, nincs AI, nincs side effect. `handlers.ts` kizárólag `import type` utasításokat tartalmaz → Node.js test runner kompatibilis.

---

## 4. Status Semantics

| Státusz | Feltétel | UI Magyar |
|---------|----------|-----------|
| STRONG_FIT | employer value ∈ preferred tartomány/halmaz | Jól illeszkedik |
| ACCEPTABLE | employer value ∈ acceptable (preferred-en kívül) + low/medium importance | Elfogadható |
| CLARIFY | employer value ∈ acceptable (preferred-en kívül) + high/essential importance | Érdemes tisztázni |
| LOAD_POINT | employer value ∉ acceptable tartomány/halmaz – **MINDIG**, importance irreleváns | Lehetséges terhelési pont |
| UNKNOWN | hiányzó employer adat VAGY user unknown=true VAGY kitöltetlen user preferencia | Nincs elég információ |

**LOAD_POINT invariáns:** importance SOHA nem enyhíti. ✅
**CLARIFY escalation:** kizárólag ACCEPTABLE → CLARIFY, ha high/essential. ✅
**Boolean indifferent:** preferred_boolean = null → ACCEPTABLE (soha nem STRONG_FIT). ✅
**Boolean false:** mindig valid adat, === null check, soha nem falsy. ✅

---

## 5. Confidence Semantics

`DataConfidence` és `CompatibilityStatus` két külön réteg. SELF_REPORTED önmagában NEM jelent UNKNOWN státuszt. A confidence az employer `job_role_env_values.data_source` értékéből jön.

---

## 6. Data Model / Migration

**Tábla:** `vk_compatibility_results`

| Oszlop | Típus | Leírás |
|--------|-------|--------|
| id | uuid PK | – |
| user_id | uuid → auth.users | tulajdonos |
| career_profile_id | uuid | karrierprofil |
| career_profile_version_hash | text | profil verzió |
| job_role_id | uuid → vk_job_roles | munkakör |
| job_role_profile_version_hash | text | munkakör verzió |
| compatibility_engine_version | text | motor verzió |
| dimension_results | jsonb | CompatibilityResult[] |
| created_at / updated_at | timestamptz | – |

**UNIQUE:** `(user_id, job_role_id)` – upsert-tel frissül.

---

## 7. Versioning

```ts
COMPATIBILITY_ENGINE_VERSION = '1.0.0'
```

Minden result tartalmaz `compatibility_engine_version` értéket. Ha a motor verziója változik → stale detection.

---

## 8. Result Persistence

`upsertCompatibilityResult()` upsert on conflict `(user_id, job_role_id)`. Az eredmény mindig konkrét `career_profile_version_hash` + `job_role_profile_version_hash` + `engine_version` kombinációhoz kötött.

---

## 9. Stale Detection

```ts
isResultStale(stored, currentCareerHash, currentJobRoleHash):
  stored.career_profile_version_hash   !== currentCareerHash   → stale
  stored.job_role_profile_version_hash !== currentJobRoleHash  → stale
  stored.compatibility_engine_version  !== CURRENT_VERSION     → stale
```

A page.tsx auto-recompute: ha stale vagy hiányzik az eredmény, a Server Component automatikusan újraszámolja és upsert-eli renderelés előtt.

---

## 10. Compatibility Map UI

**Route:** `/vedett-karrier/kompatibilitas/[jobRoleId]`

- Auth-only (redirect ha nem bejelentkezve)
- Munkakör neve, munkakörcsalád
- Magyarázó szöveg: „nem alkalmassági vizsgálat"
- 5 Summary kártya: darabszám **nem percentage**
- 10 VKMM fődimenzió `<details>` expand/collapse
- Per-aldimenzió: státusz badge + szöveg label (nem csak szín) + explanation
- CLARIFY CTA: „Érdemes erről az interjún rákérdezni."
- LOAD_POINT CTA: semleges megfogalmazás
- Filter: all / load_point / clarify / important (URL searchParams, nem ranking)
- Stale/recompute banner
- „Jelentkezz / Ne jelentkezz" CTA szándékosan nincs

---

## 11. Privacy

- `dimension_results` csak a user saját adatát tartalmazza
- `user_note` NEM kerül a resultba
- Log: csak `role_id`, `engine_version`, `total` – user preferencia adat nem kerül logba
- Employer nem látja: NEM adja vissza a route, NEM tároljuk employer-oldalon

---

## 12. RLS

```sql
ALTER TABLE vk_compatibility_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vk_compat_user_own"
  ON vk_compatibility_results FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- Employer policy SZÁNDÉKOSAN HIÁNYZIK
```

User: saját sor ✅ | Employer: nincs SELECT ✅ | Public: nincs SELECT ✅

---

## 13. Security

- Employer NEM fér hozzá compatibility_results-hoz (RLS + nincs employer policy)
- User A NEM fér User B eredményéhez (RLS: auth.uid() = user_id)
- service_role key NEM kerül kliensre
- Computation: user auth context, nem service_role
- Érzékeny user adat (preferencia raw values, user_note) NEM kerül logba

---

## 14. Accessibility

- Státusz: szöveg label + dot (nem csak szín) ✅
- `aria-label` a status dot-on ✅
- Keyboard: `<details>` natív keyboard accessible ✅
- Filter: Link elemek, keyboard accessible ✅
- Semleges, nyugodt tónus ✅

---

## 15. Test Results

```
node --experimental-strip-types __tests__/vedett-karrier/compatibility.test.ts

# tests 56 | suites 7 | pass 56 | fail 0 | duration_ms ~307
```

### Test suite fedettség

| Suite | Tesztek |
|-------|---------|
| `applyImportanceEscalation` | 6 – low/medium→ACCEPTABLE, high/essential→CLARIFY, LOAD_POINT invariáns, STRONG_FIT invariáns |
| `handleHI` | 9 – strong_fit, boundary, acceptable+low, clarify+high, load_point+low, load_point+essential, employer_missing, user_unknown, pref_missing |
| `handleRP` | 8 – strong_fit, boundary, acceptable+low, clarify+essential, below_min, above_max, employer_missing, all_null |
| `handleSM` | 6 – strong_fit, acceptable+low, clarify+high, load_point, employer_missing, empty_sets |
| `handleBP` | 10 – true+true, false+false (valid!), null+true, null+false, indifferent_never_strong_fit, acc+low, acc+essential, outside, employer_missing, false_not_missing |
| `handleFR` | 9 – strong_fit, boundary, acc+low, acc+high, outside, domain_ordering, alphabetic_not_used, invalid_code, employer_missing |
| `Globális invariánsok` | 8 – LOAD_POINT always (HI essential), LOAD_POINT always (SM low), indifferent×2, missing employer, SELF_REPORTED≠UNKNOWN, no score/pct field, LOAD_POINT not softened |

---

## 16. Invariant Tests

| Invariáns | Teszt | Eredmény |
|-----------|-------|----------|
| outside acceptable → ALWAYS LOAD_POINT | ✅ | PASS |
| importance soha nem enyhíti LOAD_POINT-ot | ✅ | PASS |
| boolean indifferent → ACCEPTABLE | ✅ | PASS |
| boolean indifferent → soha nem STRONG_FIT | ✅ | PASS |
| missing employer → UNKNOWN | ✅ | PASS |
| SELF_REPORTED alone → NOT UNKNOWN | ✅ | PASS |
| nincs score/percentage/suitability/rank mező | ✅ | PASS |
| boolean false valid adat | ✅ | PASS |

---

## 17. Legacy Diff Audit

Sprint 5 előtti fájlok módosítva: **0**

Git diff nem Sprint 5 fájlok:
- `app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx` – pre-existing módosítás (Sprint 4 report is dokumentálta)
- `tsconfig.tsbuildinfo` – build artifact, nem forrásfájl

---

## 18. Production Status

**NEM deployolva productionbe.** ✅
**Production DB NEM módosult.** ✅
**Migration fájl létrehozva, NEM alkalmazva.** ✅

---

## 19. Deviations

A masterprompt `handlers/` alkönyvtár struktúrát javasolt (higherIsMoreDemanding.ts stb.). A végleges implementáció egységes `handlers.ts` fájlt használ – ez a Node.js test runner kompatibilitás miatt szükséges (import lánc kezelés), és a masterprompt "javasolt" (nem kötelező) struktúrát jelölt. Minden funkció teljes egészében implementálva.

---

## 20. Blockers

Nincsenek.

---

## 21. Sprint 6 Entry Criteria

- Sprint 5 GO ✅
- Job Opportunity model tervezése
- Employer candidate view politika eldöntése (NEM compatibility visibility)
- Interjú-előnézet CTA integráció (CLARIFY hookra)
- Aggregált analytics terv (user-szintű adat nélkül)

---

## 22. GO / NO-GO Recommendation

**✅ GO FOR SPRINT 6**

---

## Új fájlok (Sprint 5)

### DB
- `supabase/migrations/20260903_vedett_karrier_sprint5.sql`

### Lib
- `lib/vedett-karrier/compatibility/handlers.ts`
- `lib/vedett-karrier/compatibility/engine.ts`
- `lib/vedett-karrier/compatibility/data.ts`

### App
- `app/vedett-karrier/kompatibilitas/[jobRoleId]/actions.ts`
- `app/vedett-karrier/kompatibilitas/[jobRoleId]/page.tsx`

### Tests
- `__tests__/vedett-karrier/compatibility.test.ts` (56 teszt)

### Docs
- `docs/vedett-karrier/SPRINT_5_REPORT.md`

---

## ⛔ SPRINT 6 NEM KEZDŐDIK EL

Sprint 5 lezárult. Sprint 6 implementációja külön, explicit utasítás alapján indítható.
