# Authorization Matrix – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – I. fejezet
**Státusz:** Sprint 0.5 sign-off dokumentum

---

## Védelmi rétegek

Minden érzékeny Server Actionben kötelező sorrend:
1. `auth check` – session létezik-e?
2. `ownership check` – a resource a kérő felhasználóhoz tartozik-e?
3. `employer approval check` – ha employer action, approved-e?
4. `RLS backstop` – DB szinten is megáll, ha a fentiek hibáznának

---

## Felhasználói műveletek

| ACTION | ACTOR | AUTH REQUIRED | OWNERSHIP CHECK | EMPLOYER APPROVAL | RLS BACKSTOP | ADMIN ONLY | PUBLIC |
|---|---|---|---|---|---|---|---|
| Career profile create | User | ✅ | ✅ user_id = session.uid | — | ✅ | ❌ | ❌ |
| Career profile update | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Career profile dimensions update | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Skills update | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Career interests update | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Compatibility compute | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Compatibility results read | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Preference document create | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Preference document share (explicit) | User | ✅ | ✅ | — | ✅ | ❌ | ❌ |
| Career Discovery view | User | ✅ | — | — | ✅ | ❌ | ❌ |

## Munkáltatói műveletek

| ACTION | ACTOR | AUTH REQUIRED | OWNERSHIP CHECK | EMPLOYER APPROVAL | RLS BACKSTOP | ADMIN ONLY | PUBLIC |
|---|---|---|---|---|---|---|---|
| Employer registration | Employer | ✅ | — | — (creates pending) | ✅ | ❌ | ❌ |
| Employer profile update | Employer | ✅ | ✅ employer.user_id | — | ✅ | ❌ | ❌ |
| Workplace create | Employer | ✅ | ✅ employer.user_id | ✅ status=approved | ✅ | ❌ | ❌ |
| Workplace update | Employer | ✅ | ✅ | ✅ status=approved | ✅ | ❌ | ❌ |
| Job role create | Employer | ✅ | ✅ employer.user_id | ✅ status=approved | ✅ | ❌ | ❌ |
| Job role update | Employer | ✅ | ✅ | ✅ status=approved | ✅ | ❌ | ❌ |
| VKMM role profile update | Employer | ✅ | ✅ | ✅ status=approved | ✅ | ❌ | ❌ |
| Opportunity create | Employer | ✅ | ✅ | ✅ status=approved | ✅ | ❌ | ❌ |
| Opportunity update | Employer | ✅ | ✅ | ✅ status=approved | ✅ | ❌ | ❌ |
| Employer note create/update | Employer | ✅ | ✅ | — | ✅ | ❌ | ❌ |

## Admin műveletek

| ACTION | ACTOR | AUTH REQUIRED | OWNERSHIP CHECK | EMPLOYER APPROVAL | RLS BACKSTOP | ADMIN ONLY | PUBLIC |
|---|---|---|---|---|---|---|---|
| Employer approve/reject | Admin | ✅ | — | — | ✅ | ✅ | ❌ |
| Job role approve/reject | Admin | ✅ | — | — | ✅ | ✅ | ❌ |
| VKMM seed manage | Admin | ✅ | — | — | ✅ | ✅ | ❌ |
| Compatibility results audit | Admin | ✅ | — (aggregated only) | — | ✅ | ✅ | ❌ |
| Career families manage | Admin | ✅ | — | — | ✅ | ✅ | ❌ |
| User moderation | Admin | ✅ | — | — | ✅ | ✅ | ❌ |

## Publikus (anon) műveletek

| ACTION | ACTOR | AUTH REQUIRED | OWNERSHIP CHECK | EMPLOYER APPROVAL | RLS BACKSTOP | ADMIN ONLY | PUBLIC |
|---|---|---|---|---|---|---|---|
| VKMM referencia olvasás | Anon | ❌ | — | — | ✅ | ❌ | ✅ |
| Career families olvasás | Anon | ❌ | — | — | ✅ | ❌ | ✅ |
| Published job roles olvasás | Anon | ❌ | — | — | ✅ | ❌ | ✅ |
| Published opportunities olvasás | Anon | ❌ | — | — | ✅ | ❌ | ✅ |
| Published workplace olvasás | Anon | ❌ | — | — | ✅ | ❌ | ✅ |

---

## Kritikus tilalmak

- ❌ Employer NEM olvas `compatibility_results` adatot
- ❌ Employer NEM rangsorolhat felhasználókat
- ❌ Employer NEM szűrhet jelölteket a rendszeren keresztül
- ❌ `service_role` NEM kerülhet normál user/employer flow-ba
- ❌ User profiladat NEM kerül employer-hez explicit user action nélkül
