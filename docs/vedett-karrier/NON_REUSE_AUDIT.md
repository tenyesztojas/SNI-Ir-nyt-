# Védett Karrier – Non-Reuse Audit (Clean Room Boundary)

**Dátum:** 2026-09-03
**Scope:** VK kódbázis vs. VédettMunka legacy kódbázis
**Cél:** Igazolni, hogy a VK rendszer NEM vesz át legacy üzleti logikát, mezőneveket, taxonómiát, ATS-t.

---

## 1. Clean Room Boundary Definíció

A VK (Védett Karrier) és a VM (VédettMunka) két különálló rendszer. A Clean Room Boundary azt tiltja, hogy:

- VK átvegyen VM-specifikus üzleti taxonómiát (pl. álláskategóriák, álláscímek slug-ok)
- VK átnevezzen VM mezőneveket
- VK reuse-olja a VM ATS (applicant tracking) logikáját
- VK módosítsa a VM legacy fájlokat
- VK törölje a VM táblákat

---

## 2. DB Szétválasztás

### VK saját táblák

| Tábla | Prefix | VM-független |
|-------|--------|-------------|
| `vkmm_dimensions` | vkmm_ | ✅ |
| `vkmm_sub_dimensions` | vkmm_ | ✅ |
| `career_profiles` | — | ✅ (új tábla) |
| `career_profile_dimensions` | — | ✅ (új tábla) |
| `vk_job_roles` | vk_ | ✅ |
| `vk_employer_workplaces` | vk_ | ✅ |
| `job_role_env_values` | — | ✅ (új tábla) |
| `vk_compatibility_results` | vk_ | ✅ |
| `vk_opportunities` | vk_ | ✅ |
| `work_preference_documents` | — | ✅ (új tábla) |
| `industries` | — | ✅ (általános referencia) |
| `job_families` | — | ✅ (VK task-pattern alapú, nem VM kategória) |
| `skills` | — | ✅ (VK skill set, nem VM) |
| `user_skills` | — | ✅ (új tábla) |
| `career_interests` | — | ✅ (új tábla) |

### VM táblák (ÉRINTETLEN)

| Tábla | VK által módosítva |
|-------|-------------------|
| `jobs` (VM hirdetések) | ❌ NEM |
| `employers` | ⚠️ FK használat (lásd §4) |
| `job_applications` | ❌ NEM |
| `cv_documents` | ❌ NEM |
| `vm_job_attributes` | ❌ NEM |
| `vm_work_profiles` | ❌ NEM |

---

## 3. Üzleti Taxonómia Szétválasztás

### VK VKMM modell

A VK saját dimenziókra (fizikai terhelés, munkaidő, döntéshozatal, stb.) épülő VKMM (Védett Karrier Munkakörnyezeti Modell) taxonomiát használ. Ez:

- Nem azonos a VM álláskategória rendszerével
- Nem vesz át VM slug-okat
- Saját `vkmm_dimensions` és `vkmm_sub_dimensions` táblákban él
- Saját seed adattal (`vkmm-seed.ts` / `vkmm-seed-sprint4.ts`)

**Audit eredmény:** Nincs VM taxonómiai reuse. ✅

### Job Families (VK Sprint 3)

A VK `job_families` tábla 25 task-pattern alapú munkakörcsaládot tartalmaz — ez VK-specifikus koncepció (mit csinál valaki a munkában, nem mit keres). Ezek NEM másolják a VM álláskategóriákat. ✅

### Skills (VK Sprint 3)

60 VK-specifikus skill kód (pl. `data-entry`, `precise-assembly`, `plant-care`) — ezek nem azonosak VM álláskategóriákkal vagy munkaattribútumokkal. ✅

---

## 4. `employers` Tábla Reuse

**Tény:** A VK `vk_job_roles` és `vk_opportunities` táblák `employer_id` FK-t hivatkoznak az `employers` táblára (VM tábla). Ez tudatos, dokumentált architectural döntés (ADR-003, Clean Room Boundary dokumentum).

**Indoklás:** Az `employers` tábla autentikációs entitás (ki a munkáltató?) — nem üzleti logika (milyen álláshirdetést ad fel). A VK nem örökli az `employers` táblán lévő VM-specifikus logikát, csak az entitás identitását használja.

**Auditált korlát:** A VK nem olvas VM-specifikus mezőket az `employers` táblából. A `getEmployerByUserId()` és `isEmployerApproved()` függvények csak generikus employer rekordot keresnek (`user_id`, `status`).

**Verdict:** ELFOGADHATÓ, dokumentált boundary exception. ✅

---

## 5. Legacy Fájl Módosítás Audit

### VM fájlok érintetlenségének ellenőrzése

| Könyvtár | VK által módosítva |
|----------|-------------------|
| `app/vedettmunka/*` | ❌ NEM módosítva |
| `lib/vedettmunka/*` | ❌ NEM módosítva |
| `supabase/migrations/20260829_vedettmunka.sql` | ❌ NEM módosítva |

**Kivétel (pre-existing, Sprint 4/5 dokumentálva):**
- `app/vedettmunka/oneletrajz/szerkeszto/CvSzerkesztoClient.tsx` — pre-existing módosítás a cowork session előtti időszakból. Sprint 6 NEM érintette. A Sprint 6 Report és MVP_COMPLETION_AUDIT is dokumentálja. Ez nem VK Clean Room violation.

---

## 6. ATS / Jelöltpipeline Hiány — Pozitív bizonyítékok

| Bizonyíték | Forrás |
|-----------|--------|
| `ApplicationMethod` enum: EXTERNAL_URL / EMAIL / CONTACT_INSTRUCTIONS (INTERNAL_APPLICATION szándékosan hiányzik) | `types/opportunity.ts` |
| Nincs `job_applications` tábla a VK migration-ökben | Sprint 1–6 migration audit |
| Nincs employer SELECT policy `vk_compatibility_results`-on | Sprint 5 migration |
| Nincs employer SELECT policy `work_preference_documents`-on | Sprint 6 migration |
| Nincs jelöltkereső / szűrő route | Route lista audit |
| Nincs jelölt rangsorolás | `buildCompatibilitySummary`: csak STRONG_FIT/ACCEPTABLE/stb. darabszám |
| Opportunity detail: "A Védett Karrier nem közvetíti a profiladatodat" szöveg | `lehetosegek/[id]/page.tsx` |

---

## 7. AI / Score Hiány — Pozitív bizonyítékok

| Bizonyíték | Forrás |
|-----------|--------|
| `template.ts` pure function, nincs LLM/AI hívás | Kód audit |
| `generatePreferenceDimensionBlocks`: determinisztikus, tesztelt | `opportunity.test.ts` 26/26 |
| Nincs `score`, `rank`, `suitability`, `pontszám`, `rangsor` az üzleti logikában | Grep audit (csak tiltó kommentekben) |
| `CompatibilityStatus` enum: STRONG_FIT / ACCEPTABLE / CLARIFY / LOAD_POINT / UNKNOWN — nincs numerikus score | `types/compatibility.ts` |
| `buildCompatibilitySummary`: darabszám, NEM százalék | Sprint 5 kód |

---

## 8. Mezőnév Audit

### VK SavedDimensionRow mezőnevek

VK saját mezőneveket használ, amelyek az adatmodellből (nem VM-ből) erednek:

- `preferred_min_value`, `preferred_max_value`
- `acceptable_min_value`, `acceptable_max_value`
- `preferred_min_frequency`, `preferred_max_frequency`
- `preferred_categories_json`, `acceptable_categories_json`
- `preferred_boolean`, `acceptable_boolean_json`

Ezek NEM másolják VM `vm_work_profiles` vagy `vm_job_attributes` mezőneveit. ✅

---

## 9. Összefoglalás

| Clean Room Kritérium | Teljesül |
|--------------------|---------|
| Legacy VM üzleti taxonómia NEM reuse-olva | ✅ |
| Legacy VM ATS logika NEM reuse-olva | ✅ |
| Legacy VM fájlok NEM módosítva | ✅ (1 pre-existing, dokumentált) |
| Legacy VM migráció NEM módosítva | ✅ |
| Legacy VM tábla NEM törölve | ✅ |
| `employers` FK: dokumentált exception | ✅ |
| Saját VKMM taxonómia | ✅ |
| Saját JobFamily / Skills rendszer | ✅ |
| Nincs AI / score / rank | ✅ |
| Nincs INTERNAL_APPLICATION / ATS | ✅ |

**Verdict: CLEAN ROOM BOUNDARY TELJESÜL.** A VK rendszer önálló, a VM rendszertől logikailag és adatban elkülönített.
