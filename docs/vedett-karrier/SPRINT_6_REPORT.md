# Védett Karrier – Sprint 6 Report

**Dátum:** 2026-09-03
**Sprint:** 6 – JOB OPPORTUNITY + PREFERENCIALAP + KÜLSŐ KAPCSOLATFELVÉTEL + MVP FLOW LEZÁRÁSA
**Verdict:** ✅ MVP COMPLETE – ÁLLJ MEG

---

## 1. Executive Summary

A Sprint 6 implementálta a Job Opportunity adatmodellt, az employer lehetőségkezelési flow-t, a user-oldali lehetőség böngészőt és részletes oldalt, valamint a Preferencialapot (determinisztikus szöveggenerátor + PDF export + megosztás). A Védett Karrier MVP minden tervezett sprinte lezárult.

**Nincs AI matching. Nincs alkalmassági pontszám. Nincs belső ATS. Nincs jelöltpipeline.**

---

## 2. Sprint 6 Architecture

```
supabase/migrations/
  20260903_vedett_karrier_sprint6.sql    # vk_opportunities + work_preference_documents + RLS

lib/vedett-karrier/
  types/opportunity.ts                   # JobOpportunityRow, ApplicationMethod, OpportunityStatus
  types/preferencialap.ts                # PreferenceDocumentRow, PreferenceDimensionBlock
  opportunity/
    data.ts                              # DB access: getActiveOpportunities, getOpportunityById, CRUD
    actions.ts                           # 'use server': createJobOpportunity, updateJobOpportunity,
                                         #              activateJobOpportunity, closeJobOpportunity
  preferencialap/
    template.ts                          # Determinisztikus szöveggenerátor (NEM AI)
    data.ts                              # DB access: get/upsert/share/unshare/delete
    actions.ts                           # 'use server': generateAndSavePreferenceDocument,
                                         #              shareDocument, unshareDocument,
                                         #              deletePreferenceDocument

app/vedett-karrier/
  lehetosegek/
    page.tsx                             # Aktív lehetőségek listája (publikus)
    [id]/page.tsx                        # Lehetőség részletek + külső kapcsolatfelvétel
  preferencialap/
    page.tsx                             # Preferencialap builder + mentett dokumentumok
    PreferenceDocumentViewer.tsx         # Client Component: megtekintés + PDF + megosztás
    megosztas/[token]/page.tsx           # Megosztott dok. publikus nézete

app/vedett-karrier/munkaltato/
  lehetosegek/
    new/page.tsx                         # Employer: új lehetőség létrehozása
    [id]/page.tsx                        # Employer: saját lehetőség kezelése (activate/close)
  munkakorok/[id]/page.tsx               # CTA hozzáadva: "Új álláslehetőség" gomb

__tests__/vedett-karrier/
  opportunity.test.ts                    # 26 teszt: opportunity invariánsok + template
```

---

## 3. Job Opportunity adatmodell

**Tábla:** `vk_opportunities`

| Oszlop | Típus | Leírás |
|--------|-------|--------|
| id | uuid PK | – |
| employer_id | uuid → employers | tulajdonos |
| job_role_id | uuid → vk_job_roles | kapcsolódó munkakör |
| status | text | 'draft' / 'active' / 'closed' |
| title_override_hu | text? | opcionális cím override |
| description_hu | text | leírás (kötelező) |
| requirements_hu | text? | elvárások (opcionális) |
| application_method | text | EXTERNAL_URL / EMAIL / CONTACT_INSTRUCTIONS |
| application_url | text? | külső URL |
| application_email | text? | e-mail cím |
| application_instructions_hu | text? | leírt útmutató |
| contact_person_name | text? | kapcsolattartó neve |
| contact_person_title | text? | beosztása |
| valid_from / valid_until | date? | érvényességi idő |
| created_at / updated_at | timestamptz | – |

**Nincs INTERNAL_APPLICATION módszer.** A kapcsolatfelvétel külső csatornán történik – a rendszer nem közvetíti a jelölteket.

---

## 4. Opportunity státusz lifecycle

```
draft → active (employer explicit aktiválás)
active → closed (employer explicit lezárás – NEM törlés, visszafordíthatatlan)
closed → (end state)
```

- Draft: csak az employer saját dashboardján látható
- Active: publikusan látható (anon + auth user)
- Closed: nem publikus, nem szerkeszthető

---

## 5. Preferencialap (work_preference_documents)

**Tábla:** `work_preference_documents`

| Oszlop | Típus | Leírás |
|--------|-------|--------|
| id | uuid PK | – |
| user_id | uuid → auth.users | tulajdonos |
| career_profile_id | uuid → career_profiles | – |
| title_hu | text | user által adott cím |
| selected_dimension_codes | jsonb | kiválasztott aldimenzió kódok |
| generated_text_hu | text | determinisztikus sablon (NEM AI) |
| is_shared | bool | alapértelmezett: false |
| share_token | uuid? | UNIQUE, ha megosztva |
| created_at / updated_at | timestamptz | – |

---

## 6. Determinisztikus szöveggenerátor

`lib/vedett-karrier/preferencialap/template.ts`

- Pure function: nincs DB, nincs AI, nincs side effect
- Minden value_type-ra külön kezelés: ordinal, categorical, boolean, frequency
- `boolean === null` → "mindegy" (soha nem falsy check, false valid adat)
- `is_unknown = true` → "Még nem töltöttem ki"
- `buildPreferenceDocumentText()` → fejléc + blokkok + záradék
- Determinisztikus invariáns: azonos bemenet → azonos kimenet (tesztelt)

---

## 7. ApplicationMethod

| Módszer | Leírás |
|---------|--------|
| EXTERNAL_URL | Link a munkáltató saját oldalára |
| EMAIL | E-mail cím megjelenítése, user másol |
| CONTACT_INSTRUCTIONS | Leírt szöveges útmutató |

`INTERNAL_APPLICATION` szándékosan NEM létezik. Nincs belső ATS, nincs jelöltpipeline.

---

## 8. RLS

### vk_opportunities

| Policy | Szabály |
|--------|---------|
| `vk_opp_public_select_active` | Anon + auth: SELECT WHERE status='active' |
| `vk_opp_employer_own_select` | Employer: SELECT saját (employer_id) |
| `vk_opp_employer_own_insert` | Employer: INSERT saját |
| `vk_opp_employer_own_update` | Employer: UPDATE saját |
| DELETE policy | SZÁNDÉKOSAN HIÁNYZIK (close ≠ törlés) |

### work_preference_documents

| Policy | Szabály |
|--------|---------|
| `work_pref_doc_user_own` | User: ALL saját (user_id = auth.uid()) |
| `work_pref_doc_shared_read` | Anon: SELECT WHERE is_shared=true AND share_token IS NOT NULL |
| Employer policy | SZÁNDÉKOSAN HIÁNYZIK |

---

## 9. Privacy / Security

- Employer NEM fér hozzá: `work_preference_documents`, `vk_compatibility_results`, `career_profile_dimensions`
- Preferencialap megosztás: user explicit döntés (shareDocument action → share_token generálás)
- Share URL nem kerül automatikusan a munkáltatóhoz – user maga küldi el
- `service_role` key nem kerül kliensre
- Érzékeny user adat nem kerül logba

---

## 10. Employer flow összefoglalás

1. Employer aktív munkakörre kattint → CTA: „Új álláslehetőség ehhez a munkakörhez"
2. `/vedett-karrier/munkaltato/lehetosegek/new?jobRoleId=...` → form kitöltés
3. Mentés → draft státusz (nem látható publikusan)
4. `/vedett-karrier/munkaltato/lehetosegek/[id]` → aktiválás gomb
5. Aktiválás → publikusan látható a `/vedett-karrier/lehetosegek` oldalon
6. Lezárás → `closed` (nem publikus, nem szerkeszthető)

---

## 11. User flow összefoglalás

1. `/vedett-karrier/lehetosegek` → aktív lehetőségek listája (publikus)
2. Lehetőség kártyára kattint → `/vedett-karrier/lehetosegek/[id]`
3. Kapcsolatfelvétel: külső URL / e-mail / útmutató
4. Ha bejelentkezve: link a Kompatibilitási Térképre (user-oldali önértékelés, NEM munkáltatói szűrő)
5. `/vedett-karrier/preferencialap` → Preferencialap builder
6. Dimenzió kiválasztás → Generálás → Mentés → opcionális megosztás

---

## 12. Test Results

```
node --experimental-strip-types __tests__/vedett-karrier/opportunity.test.ts

# tests 26 | suites 5 | pass 26 | fail 0
```

### Suite fedettség

| Suite | Tesztek |
|-------|---------|
| Opportunity status lifecycle | 4 – draft/active/closed invariánsok |
| ApplicationMethod validation | 3 – érvényes módszerek, INTERNAL_APPLICATION hiánya |
| generatePreferenceDimensionBlocks | 11 – ordinal, boolean, categorical, frequency, unknown, missing |
| buildPreferenceDocumentText | 3 – fejléc, záradék, determinizmus |
| Globális invariánsok | 5 – INTERNAL_APPLICATION hiánya, boolean false valid, employer access hiánya |

---

## 13. TypeScript

```
npx tsc --noEmit → 0 hiba
```

---

## 14. Legacy Diff Audit

Sprint 6 előtti fájlok módosítva: **1 (nem Sprint 6 kód)**
- `app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx` – pre-existing módosítás (Sprint 4/5 report is dokumentálta), nem Sprint 6 érintett

Sprint 6 módosított nem-VK fájl: 0.

---

## 15. No-Go Language Audit

Sprint 6 kódban NO-GO kifejezések (`score`, `suitability`, `rank`, `alkalmassági`, `pontszám`, `rangsor`) csak magyarázó kommentekben fordulnak elő, amelyek kifejezetten TILTJÁK ezeket:

```
// KRITIKUS: Nincs AI matching, alkalmassági pontszám, automatikus jelöltértékelés
// - Nincs suitability score, ranking, AI matching
// - Jelöltrangsor, pontszám, alkalmassági értékelés [TILOS]
```

Üzleti logikában: **0 előfordulás.**

---

## 16. Production Status

**NEM deployolva productionbe.** ✅
**Production DB NEM módosult.** ✅
**Migration fájl létrehozva, NEM alkalmazva.** ✅

---

## 17. Deviations

A masterprompt egységes formon alapuló employer lehetőség wizard-ot javasolt. A végleges implementáció egylépéses Server Action formot használ (inline form action, redirect mentés után) – ez az MVP scope-nak megfelelő, tömörebb és kevesebb kliens állapotot igényel. Minden funkcionális követelmény teljesített.

---

## 18. Blockers

Nincsenek.

---

## 19. Sprint 6 Invariant Compliance

| Invariáns | Ellenőrzés | Eredmény |
|-----------|------------|----------|
| Nincs AI matching | Kód + tesztek | ✅ |
| Nincs alkalmassági pontszám | Kód + tesztek | ✅ |
| Nincs belső ATS | ApplicationMethod enum + RLS | ✅ |
| Employer NEM rangsorolhat | RLS: nincs employer SELECT vk_compat_results + work_pref_docs | ✅ |
| User profiladat NEM kerül employerhez | Server action auth chain + no-go audit | ✅ |
| service_role key NEM kliensoldalon | Kód audit | ✅ |
| RLS NEM kikapcsolva | Migration audit | ✅ |
| NEM deployolva production | ✅ | ✅ |
| Preferencialap NEM AI | template.ts pure function, nincs LLM hívás | ✅ |
| boolean false valid adat | `=== null` check, tesztelve | ✅ |

---

## 20. Új fájlok (Sprint 6)

### DB
- `supabase/migrations/20260903_vedett_karrier_sprint6.sql`

### Lib
- `lib/vedett-karrier/types/opportunity.ts`
- `lib/vedett-karrier/types/preferencialap.ts`
- `lib/vedett-karrier/opportunity/data.ts`
- `lib/vedett-karrier/opportunity/actions.ts`
- `lib/vedett-karrier/preferencialap/template.ts`
- `lib/vedett-karrier/preferencialap/data.ts`
- `lib/vedett-karrier/preferencialap/actions.ts`

### App
- `app/vedett-karrier/lehetosegek/page.tsx`
- `app/vedett-karrier/lehetosegek/[id]/page.tsx`
- `app/vedett-karrier/preferencialap/page.tsx`
- `app/vedett-karrier/preferencialap/PreferenceDocumentViewer.tsx`
- `app/vedett-karrier/preferencialap/megosztas/[token]/page.tsx`
- `app/vedett-karrier/munkaltato/lehetosegek/new/page.tsx`
- `app/vedett-karrier/munkaltato/lehetosegek/[id]/page.tsx`

### Módosított (nem Sprint 6 fájl)
- `app/vedett-karrier/munkaltato/munkakorok/[id]/page.tsx` – CTA gomb hozzáadva

### Tests
- `__tests__/vedett-karrier/opportunity.test.ts` (26 teszt)

### Docs
- `docs/vedett-karrier/SPRINT_6_REPORT.md`
- `docs/vedett-karrier/MVP_COMPLETION_AUDIT.md`

---

## ⛔ SPRINT 6 LEZÁRULT – ÁLLJ MEG

A Védett Karrier MVP implementálása kész.
**Sprint 7 NEM kezdődik el automatikusan.**
Post-MVP feature-t NEM kezdünk explicit utasítás nélkül.
