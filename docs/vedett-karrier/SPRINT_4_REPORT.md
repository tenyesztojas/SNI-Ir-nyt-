# Védett Karrier – Sprint 4 Report

**Dátum:** 2026-09-03
**Sprint:** 4 – MUNKÁLTATÓI RENDSZER + MUNKAKÖR-TÉRKÉP + VKMM EMPLOYER WIZARD
**Verdict:** ✅ GO

---

## DoD ellenőrzőlista

| # | Kritérium | Állapot |
|---|-----------|---------|
| 1 | DB migration: `vk_employer_workplaces`, `vk_job_roles`, `job_role_env_values` + Sprint 4 ALTER-ek + `vk_public_job_role_env_values` VIEW | ✅ |
| 2 | TypeScript types: `EmployerRow`, `WorkplaceRow`, `JobRoleRow`, `EmployerDimensionValue` (union), `JobRoleEnvValueRow`, `ActivationGateResult` | ✅ |
| 3 | Determinisztikus version hash: `buildHashInput` + `computeRoleProfileHash` (SHA-256, Web Crypto) | ✅ |
| 4 | Completion számítás: `computeProfileCompletionPct`, boolean false IS valid, 80% threshold | ✅ |
| 5 | Server actions: `createWorkplace`, `createJobRole`, `updateJobRoleBasics`, `saveJobRoleDimension`, `activateJobRole`, `checkActivationGate` | ✅ |
| 6 | Authorization réteg: auth → employer → approval → Zod → DB → RLS backstop | ✅ |
| 7 | Typed input components: `OrdinalInput`, `CategoricalInput`, `BooleanInput`, `FrequencyInput` | ✅ |
| 8 | Wizard components: `DimensionQuestionCard`, `JobRoleWizard`, `Step1Basics`, `StepDimensions`, `Step7Review` | ✅ |
| 9 | Employer dashboard: `/vedett-karrier/munkaltato` – JobRoleCard rács, pending state | ✅ |
| 10 | Új munkakör létrehozás: `/vedett-karrier/munkaltato/munkakorok/new` | ✅ |
| 11 | Wizard szerkesztés: `/vedett-karrier/munkaltato/munkakorok/[id]/szerkesztes` | ✅ |
| 12 | Munkakör-Térkép: `/vedett-karrier/munkaltato/munkakorok/[id]` – publikus ha active, owner draft-hoz | ✅ |
| 13 | `employer_note` kizárva `vk_public_job_role_env_values` VIEW-ból | ✅ |
| 14 | Unit tesztek: 39/39 pass | ✅ |
| 15 | `tsc --noEmit`: 0 hiba | ✅ |
| 16 | Legacy diff: 0 Sprint 4 változás sprint-előtti fájlokban | ✅ |

---

## Tesztek

```
node --experimental-strip-types __tests__/vedett-karrier/employer.test.ts

# tests 39 | pass 39 | fail 0 | duration_ms ~80
```

### Test suite fedettség

| Suite | Tesztek |
|-------|---------|
| `computeProfileCompletionPct` | 10 – üres, ordinal, categorical, boolean false, boolean true, frequency, null, duplikált kód, total > 0, 100% |
| `isCompletionSufficientForActivation` | 5 – MIN=80, 80%, 100%, 79%, 0% |
| `buildHashInput` | 9 – determinizmus, prefix, title, null→"", rendezés, boolean false, boolean true, különböző input, employer_note nem szivárog |
| `computeRoleProfileHash` | 4 – 64 hex, determinizmus, különböző input, sorrend-invariáns |
| `checkActivationGate` | 9 – teljes, cím hiány, telephely hiány, family hiány, summary hiány, feladat hiány, <80% completion, ==80% (boundary), több hiány |

---

## tsc --noEmit

```
npx tsc --noEmit
(no output — 0 errors)
```

---

## Legacy diff

Érintett fájlok Sprint 4 előtti kódbázisból: **0**

Egyetlen módosított (nem Sprint 4) fájl: `app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx`
→ Ez pre-existing módosítás, nem Sprint 4 munka.

---

## Kritikus biztonsági invariánsok

| Invariáns | Ellenőrzés |
|-----------|-----------|
| `employer_note` NEM kerül `vk_public_job_role_env_values` VIEW-ba | ✅ SQL VIEW szándékosan kihagyja |
| `employer_note` NEM kerül `buildHashInput` kimenetébe | ✅ Teszt #8 (`employer.test.ts`) |
| Nincs `score`, `suitability`, `compatibility`, `rank`, `autizmusbarát` a hash inputban | ✅ Teszt #9 |
| Employer NEM lát `user_skills`, `career_interests`, `career_profile_dimensions` adatot | ✅ Server actions nem hívnak user-oldali data függvényeket |
| `boolean_value = false` mindig kitöltöttnek számít | ✅ `=== null` check (nem falsy) – tesztelve |
| RLS backstop aktív (ownership check AND DB policy) | ✅ `getJobRoleByIdForEmployer` + `employer_id` WHERE-klóz |
| Nincs AI matching, alkalmassági pontszám, automatikus jelölt-értékelés | ✅ Nincs ilyen kód |

---

## Új fájlok (Sprint 4)

### DB
- `supabase/migrations/20260903_vedett_karrier_sprint4.sql`

### Types & lib
- `lib/vedett-karrier/types/employer.ts`
- `lib/vedett-karrier/employer/hash.ts`
- `lib/vedett-karrier/employer/completion.ts`
- `lib/vedett-karrier/employer/data.ts`
- `lib/vedett-karrier/employer/actions.ts`

### Components
- `components/vedett-karrier/employer/inputs/OrdinalInput.tsx`
- `components/vedett-karrier/employer/inputs/CategoricalInput.tsx`
- `components/vedett-karrier/employer/inputs/BooleanInput.tsx`
- `components/vedett-karrier/employer/inputs/FrequencyInput.tsx`
- `components/vedett-karrier/employer/wizard/DimensionQuestionCard.tsx`
- `components/vedett-karrier/employer/wizard/JobRoleWizard.tsx`
- `components/vedett-karrier/employer/wizard/Step1Basics.tsx`
- `components/vedett-karrier/employer/wizard/StepDimensions.tsx`
- `components/vedett-karrier/employer/wizard/Step7Review.tsx`
- `components/vedett-karrier/employer/JobRoleCard.tsx`

### Pages
- `app/vedett-karrier/munkaltato/page.tsx` (employer dashboard)
- `app/vedett-karrier/munkaltato/munkakorok/new/page.tsx`
- `app/vedett-karrier/munkaltato/munkakorok/[id]/szerkesztes/page.tsx`
- `app/vedett-karrier/munkaltato/munkakorok/[id]/page.tsx` (Munkakör-Térkép)

### Tests
- `__tests__/vedett-karrier/employer.test.ts` (39 teszt)

---

## ⛔ SPRINT 5 NEM KEZDŐDIK EL

A specifikáció értelmében Sprint 4 után **MEGÁLLUNK**.
Sprint 5 implementációja külön, explicit utasítás alapján indítható.
