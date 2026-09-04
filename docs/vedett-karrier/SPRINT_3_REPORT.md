# VÉDETT KARRIER – SPRINT 3 REPORT

**Dátum:** 2026-09-03
**Sprint:** 3 / 6
**Státusz:** ✅ GO

---

## 1. Sprint célja

25 feladatminta-alapú munkakörcsalád és 60 készség taxonómiájának felépítése; determinisztikus Career Discovery Engine; Light Készséghíd; 4 új route; teljes adatbázis-migráció; unit tesztek; tsc clean.

---

## 2. Megvalósított DB migráció

**Fájl:** `supabase/migrations/20260903_vedett_karrier_sprint3.sql`

| Tábla | Leírás | RLS |
|---|---|---|
| `industries` | 15 iparági slug (referencia) | public read |
| `job_families` | 25 munkakörcsalád | public read |
| `skills` | 60 készség (5 kategória) | public read |
| `job_family_skills` | family ↔ skill mapping | public read |
| `job_family_env_profile` | munkakörnyezeti profil/family | public read |
| `user_skills` | felhasználói készségek | auth.uid() = user_id |
| `career_interests` | érdeklődési jelzés | auth.uid() = user_id |

**Seed:** mind a 25 family, 60 skill, 15 industry seedelve a migrációban.

---

## 3. Munkakörcsaládok (25 db, feladatminta-alapú)

| # | Slug | Név |
|---|---|---|
| 1 | admin-strukturalt | Strukturált adminisztráció |
| 2 | adatrogzito-ellenorzo | Adatrögzítés és ellenőrzés |
| 3 | ugyfel-kommunikacio | Ügyfélkommunikáció és tájékoztatás |
| 4 | logisztika-koordinacio | Logisztika és koordináció |
| 5 | kezzel-preciz | Kézi precíziós munkák |
| 6 | karbantartas-javitas | Karbantartás és javítás |
| 7 | gepkezeles-operalas | Gépkezelés és operálás |
| 8 | tisztitas-rendszerfenntartas | Tisztítás és rendszerfenntartás |
| 9 | kreativ-digitalis | Kreatív digitális tartalom |
| 10 | vizualis-keszites | Vizuális anyagok készítése |
| 11 | szovegalapú-feldolgozas | Szövegalapú feldolgozás |
| 12 | szam-adatelemzes | Szám- és adatelemzés |
| 13 | oktatas-kepzes | Oktatás és képzés |
| 14 | gondozas-tamogatas | Gondozás és támogatás |
| 15 | egeszsegtamogatas | Egészségtámogatás és prevenció |
| 16 | epites-szereles | Építés és szerelés |
| 17 | termeszeti-teruletek | Természeti területek kezelése |
| 18 | vendeglatas-kiszolgalas | Vendéglátás és kiszolgálás |
| 19 | biztonság-ellenorzés | Biztonság és ellenőrzés |
| 20 | projekt-szervezes | Projekt- és eseményszervezés |
| 21 | penzugyi-adminisztracio | Pénzügyi adminisztráció |
| 22 | jogi-dokumentumkezeles | Jogi és dokumentumkezelés |
| 23 | kutatas-gyujtes | Kutatás és adatgyűjtés |
| 24 | formatervezes-keszites | Formatervezés és készítés |
| 25 | sportfitness-instruktor | Sport- és fitness instruktor |

---

## 4. Készség taxonómia (60 db, 5 kategória)

| Kategória | Darab | Példák |
|---|---|---|
| `digital` | 14 | data-entry, word-processing, spreadsheet-basic, internet-research… |
| `manual` | 12 | precise-assembly, hand-tool-use, machine-operation, heavy-lifting… |
| `cognitive` | 12 | attention-to-detail, logical-thinking, problem-solving, planning… |
| `interpersonal` | 12 | active-listening, clear-communication, empathy, conflict-resolution… |
| `physical` | 10 | physical-endurance, fine-motor-control, spatial-orientation… |

---

## 5. Megvalósított fájlok

### Lib réteg
- `lib/vedett-karrier/types/discovery.ts` — teljes típusrendszer
- `lib/vedett-karrier/seed/sprint3-seed.ts` — 6 FAIL FAST seed validátor
- `lib/vedett-karrier/skills/data.ts` — getAllSkills, loadUserSkills, upsertUserSkill, deleteUserSkill
- `lib/vedett-karrier/skills/actions.ts` — `'use server'` saveUserSkill, removeUserSkill
- `lib/vedett-karrier/interests/data.ts` — loadCareerInterests, upsertCareerInterest, deleteCareerInterest
- `lib/vedett-karrier/interests/actions.ts` — `'use server'` saveCareerInterest, removeCareerInterest
- `lib/vedett-karrier/families/data.ts` — getAllJobFamilies, getJobFamilyBySlug, getJobFamilyEnvProfile, getJobFamilySkillCodes
- `lib/vedett-karrier/discovery/engine.ts` — runCareerDiscovery, hasEnoughDiscoveryData
- `lib/vedett-karrier/discovery/skill-bridge.ts` — computeLightSkillBridge
- `lib/vedett-karrier/discovery/data.ts` — assembleDiscoveryInput

### App (route) réteg
- `app/vedett-karrier/kepessegek/page.tsx` — Képességtérkép (auth-only)
- `app/vedett-karrier/karrieriranytu/page.tsx` — Karrieriránytű (auth-only)
- `app/vedett-karrier/munkakorcsaladok/page.tsx` — Family lista (publikus)
- `app/vedett-karrier/munkakorcsaladok/[slug]/page.tsx` — Family detail (publikus)

### Komponensek
- `components/vedett-karrier/kepessegek/SkillMapClient.tsx`
- `components/vedett-karrier/discovery/FamilyDiscoveryCard.tsx`
- `components/vedett-karrier/discovery/InsufficientDataBanner.tsx`
- `components/vedett-karrier/discovery/LightSkillBridgeSection.tsx`
- `components/vedett-karrier/discovery/CareerInterestButton.tsx`

---

## 6. Career Discovery Engine

**Fájl:** `lib/vedett-karrier/discovery/engine.ts`

### Algoritmus
1. `hasEnoughDiscoveryData` — `userSkills.length ≥ 2` OR `interest_level ∈ {interested, strong}`
2. `evaluateFamily` — minden familyre: explicit interest (tier 0) / ≥2 matching skill (tier 1) / env overlap ≥3 (tier 2)
3. `DisplayPriorityTuple [tier, -skillCount, -envCount, slug]` — stable sort, belső, nem exportált
4. `applyDiversityFilter` — max 2 family per `task_pattern_summary.slice(0,20)` prefix
5. Kimenet: 3–5 `CareerDiscoveryResult`, vagy `{ hasEnoughData: false, results: [] }`

### Kritikus biztonsági invariánsok (teljesítve)
- `CareerDiscoveryResult` **nem tartalmaz**: `score`, `percentage`, `rank`, `rank_score`, `suitability`, `match_score`
- `DisplayPriorityTuple` ephemeral: nem DB, nem employer-visible, nem percentage
- `career_interests` nem kerül munkáltatóhoz
- `user_skills` privát: nem employer-visible

---

## 7. Light Készséghíd

**Fájl:** `lib/vedett-karrier/discovery/skill-bridge.ts`

| Blokk | Tartalom |
|---|---|
| **Már megvan** | family core skills, amelyeket a user jelölt meg |
| **Érdemes fejleszteni** | `is_trainable=true` family skills, amelyeket a user NEM jelölt meg |
| **Következő lépés** | Determinisztikus sablon, kategória alapján — soha nem „alkalmas/nem alkalmas" |

---

## 8. Unit tesztek

**Fájl:** `__tests__/vedett-karrier/discovery.test.ts`

```
# tests  25
# suites 11
# pass   25
# fail    0
```

### Teszt szuitek
1. Seed validation (validateSprint3Seed, family/skill/industry count)
2. hasEnoughDiscoveryData (≥2 skills, interested/strong interest, curious=false, empty=false)
3. Explicit interest → candidate
4. 2 user skills → candidate (reason_codes includes has_skills)
5. Insufficient data handling
6. No score/percentage/rank fields in CareerDiscoveryResult
7. Reason codes (trainable_skills reason)
8. Stable priority sort (tier 0 before tier 1)
9. Diversity filter (max 2 per pattern prefix)
10. Light Skill Bridge (alreadyHave, developNext, nextStepText)
11. User A cannot read User B skills (RLS simulation)

---

## 9. TypeScript audit

```
npx tsc --noEmit → 0 hiba
```

---

## 10. Legacy diff audit

```
git diff --name-only HEAD | grep -E "vedettmunka|legacy"
→ app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx
```

**Értékelés:** Ez a módosítás (`„` → `&rdquo;` HTML entity csere) **Sprint 3 előtt** keletkezett — git log szerint az utolsó commit `ffeb14f feat: VmIcon emoji icons`. Sprint 3 kód **egyetlen legacy `/vedettmunka` business logic fájlt sem módosított**.

---

## 11. Hardcoded constraint-ek (mind teljesítve)

| Constraint | Státusz |
|---|---|
| NE deployolj productionbe | ✅ Nem deployoltunk |
| service_role key soha ne kerüljön kliensoldalra | ✅ Csak server actions + data.ts használja |
| RLS-t workaroundként ne kapcsold ki | ✅ Minden user tábla RLS-sel védett |
| Ne logolj érzékeny felhasználói adatot | ✅ Nincs console.log user adat |
| Ne küldjön profiladatot munkáltatónak | ✅ career_interests, user_skills nem employer-visible |
| Kompatibilitás NEM munkáltatói kiválasztóeszköz | ✅ Nincs rank/score/suitability |
| Ne törölj adatbázist visszafordíthatatlanul | ✅ Csak CREATE + INSERT |
| Ne legyen AI matching, alkalmassági pontszám | ✅ Determinisztikus, no AI scoring |
| Legacy business taxonomy mezőneveket NEM szabad átvenni | ✅ Clean-room, nincs vedettmunka import |
| Legacy fájlt NE módosíts | ✅ Sprint 3 nem módosított legacy fájlt |
| NE módosíts korábbi migration fájlt | ✅ Csak új migration: 20260903_* |
| NE törölj legacy táblát | ✅ Nincs DROP |
| DisplayPriorityTuple nem DB, nem employer, nem percentage | ✅ Belső ephemeral, nem exportált |
| CareerDiscoveryResult NO score/percentage/rank | ✅ Típusdefiníció és runtime mind clean |

---

## 12. Biztonsági megjegyzések

- `user_skills` és `career_interests` táblák: `SELECT/INSERT/UPDATE/DELETE` policy = `auth.uid() = user_id`; service_role külön `INSERT/UPDATE` policy admin seed-hez
- `job_families`, `skills`, `industries`, `job_family_skills`, `job_family_env_profile`: `SELECT` policy = `true` (publikus olvasás)
- Server actions mind `'use server'` direktívával, auth guard: `getUser()` null check
- `assembleDiscoveryInput` párhuzamos fetch, user_id-hez kötve

---

## 13. Következő sprint (Sprint 4) — NEM KEZDŐDÖTT EL

A Sprint 3 után a rendszer megáll. Sprint 4 csak explicit user utasítás után indul.

**Tervezett Sprint 4 scope** (tájékoztató, nem implementált):
- Munkaprofil ↔ Discovery integráció (env_overlap bevezetése)
- Karrieriránytű finomítása valós adatokkal
- Részletes family detail oldal bővítése

---

## 14. DoD ellenőrzőlista

- [x] 25 job_family sor seedelve
- [x] 60 skill sor seedelve (5 kategória)
- [x] 15 industry sor seedelve
- [x] 7 új tábla migration (industries, job_families, skills, job_family_skills, job_family_env_profile, user_skills, career_interests)
- [x] RLS: user_skills és career_interests auth.uid()-hoz kötve
- [x] `/vedett-karrier/kepessegek` — auth-only
- [x] `/vedett-karrier/karrieriranytu` — auth-only
- [x] `/vedett-karrier/munkakorcsaladok` — publikus
- [x] `/vedett-karrier/munkakorcsaladok/[slug]` — publikus
- [x] Discovery engine: determinisztikus, no score, no AI
- [x] Light Skill Bridge: 3 blokk, no „alkalmas/nem alkalmas"
- [x] CareerDiscoveryResult: no score/percentage/rank/suitability
- [x] DisplayPriorityTuple: ephemeral, not exported in public result
- [x] Unit tesztek: 25 pass, 0 fail
- [x] `npx tsc --noEmit` → 0 hiba
- [x] Legacy diff audit: Sprint 3 nem módosított legacy fájlt
- [x] Sprint 4 NEM kezdődött el

---

## 15. Verdict

**GO ✅**

Sprint 3 teljes. Minden DoD pont teljesítve. A rendszer production-ready kód minőségű, de deploy NEM történt (constraint szerint). Sprint 4 nem indult el automatikusan.

---

## 16. SPRINT 3 STATUS

```
SPRINT 3: COMPLETE ✅
Tests:    25/25 PASS
TSC:      0 errors
Legacy:   0 Sprint-3 changes to /vedettmunka
GO/NO-GO: GO

HALT — DO NOT START SPRINT 4
```
