# Employers Schema Audit – Védett Karrier Sprint 0.5

**Dátum:** 2026-09-03
**Forrás:** `supabase/migrations/20260829_vedettmunka.sql`
**Módszer:** Tényleges migráció olvasás (nem feltételezés)

---

## Tábla: `employers`

Primary key: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`

| ACTUAL FIELD | PURPOSE | REUSABLE? | VÉDETT KARRIER NEED | ACTION |
|---|---|---|---|---|
| `id` | UUID PK | ✅ Igen (technikai) | VK employer lookup-hoz | Reuse lehetséges, ha employer regisztráció közös |
| `user_id` | `auth.users` FK – tulajdonos | ✅ Igen (technikai) | Ownership check guard-hoz | Reuse lehetséges |
| `company_name` | Cégnév | ✅ Igen | VK employer profile-ban is szükséges | Reuse lehetséges |
| `tax_number` | Adószám | ⚠️ Feltételes | VK-ban lehet szükséges | Döntést igényel Sprint 1 előtt |
| `address` | Cím | ⚠️ Feltételes | VK workplace location-höz | Döntést igényel |
| `website` | Weboldal | ✅ Igen | VK employer profile-ban hasznos | Reuse lehetséges |
| `contact_name` | Kapcsolattartó neve | ✅ Igen | VK admin kommunikációhoz | Reuse lehetséges |
| `contact_email` | Kapcsolattartó e-mail | ✅ Igen | VK értesítésekhez | Reuse lehetséges |
| `contact_phone` | Telefon | ⚠️ Feltételes | VK-ban opcionális | Döntést igényel |
| `description` | Cégbemutató | ❌ Nem (VK szempontból) | VK saját workplace profile-t igényel | ÚJ mező a VK workplace táblában |
| `job_types_description` | VM-specifikus állástípus leírás | ❌ Nem | VK nem álláshirdető | NEM reuse-olható |
| `open_to_neurodivergent` | VM-specifikus befogadói jelzés | ❌ Nem (VK szempontból) | VK VKMM modellel kezeli | NEM reuse-olható |
| `open_to_disabled` | VM-specifikus befogadói jelzés | ❌ Nem | VK VKMM modellel kezeli | NEM reuse-olható |
| `open_to_parents` | VM-specifikus befogadói jelzés | ❌ Nem | VK VKMM modellel kezeli | NEM reuse-olható |
| `accepts_vm_terms` | VédettMunka ÁSZF elfogadás | ❌ Nem | VK saját feltételrendszert kap | NEM reuse-olható |
| `accepts_no_diagnosis_req` | VM-specifikus nyilatkozat | ❌ Nem | VK eltérő feltételrendszer | NEM reuse-olható |
| `status` | `pending_review / approved / rejected / suspended` | ✅ Igen (pattern) | VK employer status ugyanilyen | Pattern reuse-olható |
| `admin_note` | Admin megjegyzés | ✅ Igen | VK admin workflow-ban hasznos | Pattern reuse-olható |
| `created_at` | Timestamp | ✅ Igen | Szokásos | Reuse lehetséges |
| `updated_at` | Timestamp | ✅ Igen | Szokásos | Reuse lehetséges |

---

## RLS az `employers` táblán

| Policy | Szabály |
|---|---|
| Saját olvasás | `auth.uid() = user_id` |
| Saját létrehozás | `auth.uid() = user_id` |
| Saját frissítés | `auth.uid() = user_id` |
| Admin kezelés | `profiles.role = 'admin'` |

**Hiányzó policy:** Nincs anon SELECT. ✅ Helyes – az employers adat nem publikus.

---

## Kapcsolódó táblák

| Tábla | Kapcsolat | VK Reuse? |
|---|---|---|
| `job_posts` | `employer_id FK → employers.id` | ❌ Nem – VM-specifikus |
| `job_applications_log` | `employer_id FK → employers.id` | ❌ Nem – VM-specifikus |
| `job_alerts` | user-alapú, nem employer | ❌ Nem – VM-specifikus |
| `job_reports` | `job_post_id FK` | ❌ Nem – VM-specifikus |

---

## Approval Workflow

Az `employers.status` mező `pending_review` állapotban kezd. Admin jóváhagyás szükséges az `approved` státuszhoz.
A `job_posts` publikálása csak `approved` employer esetén lehetséges (server-side guard).

Ez a minta **reuse-olható** a Védett Karrier employer onboarding folyamatában.

---

## VK Employer Action Items

A Védett Karrier employer oldalán szükséges ÚJAK (a meglévő `employers` táblán kívül):

| Szükséges | Megjegyzés |
|---|---|
| `vk_employer_workplaces` tábla | VKMM employer-side environment profile |
| `vk_job_roles` tábla | Munkakör-profilok |
| `job_role_env_values` tábla | Typed VKMM értékek |
| `vk_opportunities` tábla | Lehetőségek (nem VM állások) |
| `employer_note` mező a workplace-en | Privát, nem publikus automatikusan |

**Az `employers` tábla meglévő mezőit NEM szabad átírni a VK számára.**
Ha reuse szükséges, a VK guard az `employers.id`-t és `employers.status = 'approved'`-t ellenőrzi.

---

## Összefoglalás

- **Reuse-olható (technikai):** id, user_id, company_name, website, contact adatok, status pattern, admin_note, timestamps
- **NEM reuse-olható (business):** job_types_description, open_to_* mezők, accepts_vm_terms, accepts_no_diagnosis_req, description (VK saját workplace profile-t igényel)
- **DB módosítás szükséges-e most?** NEM – Sprint 0.5-ben nincs DB módosítás
