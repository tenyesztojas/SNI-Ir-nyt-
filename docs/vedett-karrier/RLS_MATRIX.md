# RLS Matrix – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – H. fejezet
**Státusz:** Sprint 0.5 sign-off dokumentum

---

## Szabályok

1. RLS minden táblán aktív (`ENABLE ROW LEVEL SECURITY` + explicit policy)
2. Ha nincs explicit policy, az alapértelmezés: DENY ALL
3. Anon SELECT csak tervezett publikus adatokon
4. `service_role` csak admin utility, normál flow-ban nem
5. RLS workaroundként NEM kapcsolható ki

---

## Felhasználói profil és preferencia táblák

| TABLE | ANON SELECT | USER SELECT | USER INSERT | USER UPDATE | EMPLOYER SELECT | EMPLOYER INSERT | EMPLOYER UPDATE | ADMIN | SERVICE_ROLE | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|
| `career_profiles` | ❌ | ✅ saját | ✅ saját | ✅ saját | ❌ | ❌ | ❌ | ✅ Full | ✅ Admin utility | user_id = auth.uid() |
| `career_profile_dimensions` | ❌ | ✅ saját | ✅ saját | ✅ saját | ❌ | ❌ | ❌ | ✅ Full | ✅ Admin utility | user_id = auth.uid() |
| `user_skills` | ❌ | ✅ saját | ✅ saját | ✅ saját | ❌ | ❌ | ❌ | ✅ Full | ✅ Admin utility | user_id = auth.uid() |
| `career_interests` | ❌ | ✅ saját | ✅ saját | ✅ saját | ❌ | ❌ | ❌ | ✅ Full | ✅ Admin utility | user_id = auth.uid() |
| `work_preference_documents` | ❌ | ✅ saját | ✅ saját | ✅ saját | ❌ | ❌ | ❌ | ✅ Full | ✅ Admin utility | Privát by default; share: user explicit action |

## Kompatibilitás táblák

| TABLE | ANON SELECT | USER SELECT | USER INSERT | USER UPDATE | EMPLOYER SELECT | EMPLOYER INSERT | EMPLOYER UPDATE | ADMIN | SERVICE_ROLE | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|
| `compatibility_results` | ❌ | ✅ saját | ✅ saját | ✅ saját | ❌ ⚠️ | ❌ | ❌ | ❌ egyéni adat | ✅ Admin utility | KRITIKUS: employer soha nem fér hozzá |

## Munkáltató / munkakör táblák

| TABLE | ANON SELECT | USER SELECT | USER INSERT | USER UPDATE | EMPLOYER SELECT | EMPLOYER INSERT | EMPLOYER UPDATE | ADMIN | SERVICE_ROLE | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|
| `vk_employer_workplaces` | ❌ (draft) / ✅ (published) | ✅ published | ❌ | ❌ | ✅ saját | ✅ saját | ✅ saját | ✅ Full | ✅ | Draft nem publikus |
| `vk_job_roles` | ❌ (draft) / ✅ (published) | ✅ published | ❌ | ❌ | ✅ saját | ✅ saját approved | ✅ saját | ✅ Full | ✅ | Draft nem publikus; employer csak approved státuszban adhat hozzá |
| `job_role_env_values` | ❌ | ✅ published role-hoz | ❌ | ❌ | ✅ saját role-hoz | ✅ saját role | ✅ saját role | ✅ Full | ✅ | |
| `vk_opportunities` | ❌ (draft/expired) / ✅ (active) | ✅ active | ❌ | ❌ | ✅ saját | ✅ saját approved | ✅ saját | ✅ Full | ✅ | Lejárt opportunity nem publikus |
| `employer_notes` | ❌ | ❌ | ❌ | ❌ | ✅ saját | ✅ saját | ✅ saját | ✅ Full | ✅ | Employer note nem automatikusan publikus |

## VKMM referencia táblák

| TABLE | ANON SELECT | USER SELECT | USER INSERT | USER UPDATE | EMPLOYER SELECT | EMPLOYER INSERT | EMPLOYER UPDATE | ADMIN | SERVICE_ROLE | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|
| `vkmm_dimensions` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Full | ✅ | Publikus referencia |
| `vkmm_sub_dimensions` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Full | ✅ | Publikus referencia |
| `vkmm_compatibility_rules` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Full | ✅ | Publikus referencia |
| `career_families` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Full | ✅ | Publikus referencia |
| `career_family_roles` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Full | ✅ | Publikus referencia |
| `skill_definitions` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ Full | ✅ | Publikus referencia |

---

## Kritikus RLS ellenőrzési pontok

| Ellenőrzési pont | Státusz |
|---|---|
| `compatibility_results` user-only (employer nem fér hozzá) | ✅ Tervezett |
| `career_profile_dimensions` user-only | ✅ Tervezett |
| `user_skills` user-only | ✅ Tervezett |
| `career_interests` user-only | ✅ Tervezett |
| `work_preference_documents` user-only | ✅ Tervezett |
| `employer_note` nem publikus | ✅ Tervezett |
| Draft `job_role` nem publikus | ✅ Tervezett |
| Lejárt opportunity nem publikus | ✅ Tervezett |

---

## Megjegyzés

Ez a mátrix a tervezett RLS-t dokumentálja. Az aktuális implementation-be kerülő SQL triggerek és policy-k a Sprint 1 migráció részeként valósulnak meg. A Sprint 0.5-ben DB módosítás nem történik.
