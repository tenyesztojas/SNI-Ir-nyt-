# Clean-Room Boundary – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – ADR-006, DESIGN_ORIGIN
**Státusz:** Sprint 0.5 sign-off – LEZÁRT

---

## Általános elv

A Védett Karrier V2 clean-room implementáció.
A legacy VédettMunka business logic NEM reuse-olható.
A generikus technikai infrastruktúra reuse megengedett.

---

## REUSE ALLOWED

| Elem | Fájl/Helyszín | Megjegyzés |
|---|---|---|
| Supabase szerver kliens | `lib/supabase/server.ts` | Session-alapú auth cookie kezelés |
| Supabase kliens (browser) | `lib/supabase/client.ts` | Anon key alapú böngészős kliens |
| Supabase admin kliens | `lib/supabase/admin.ts` | service_role – csak admin utility |
| Auth session helper | middleware.ts session check mintája | Generic pattern reuse-olható |
| Resend email wrapper | `lib/resend.ts` | Generic email küldés |
| Generic Button komponens | `components/ui/` (generikus UI primitívek) | Ha léteznek, reuse-olhatók |
| Generic Modal/Dialog | `components/ui/` | Ha generikusak (nem VM-specifikus) |
| Generic Input/Form primitívek | `components/ui/` | Ha generikusak |
| Accessibility helpers | pl. `AccessibilityProvider` | Generikus |
| Generic admin auth check | Admin role check minta | `profiles.role = 'admin'` pattern |
| Rate limiting infrastruktúra | `middleware.ts` rate limit logika | Generic IP-alapú limit |
| Logging infrastruktúra | Generic log utility | Ha létezik generikus log |
| Supabase Storage infrastruktúra | Storage bucket client | Új bucket-ekhez reuse-olható |
| slugify helper | `lib/slugify.ts` | Generikus |
| countries.ts | `lib/countries.ts` | Generikus |
| tailwind.config.ts (design system) | Szín- és tipográfia változók | Ha generikus design tokenek |

---

## REUSE PROHIBITED

| Elem | Miért tiltott |
|---|---|
| Legacy VédettMunka business taxonomy | Eltérő VKMM modell – clean-room elv |
| Legacy VM mezőnevek (job_types_description, open_to_neurodivergent stb.) | VM-specifikus business mezők |
| Legacy munkakörnyezet-leírás wording | Eltérő konceptuális alap |
| Legacy kérdésstruktúrák | Eltérő VKMM kérdések |
| Legacy álláshirdetési workflow | VK nem álláshirdető |
| Legacy `job_posts` tábla mint VK alap | VM-specifikus |
| Legacy `job_applications_log` mint VK alap | VM-specifikus, VK nem pipeline |
| Legacy CV-workflow mint Karrier alap | VK Preferencialap ≠ VM önéletrajz |
| Legacy munkaprofil oldal (`/vedettmunka/munkaprofil`) | VM-specifikus mezők és workflow |
| Legacy jelentkezési flow | VM-specifikus |
| Legacy munkáltatói csomag logika | VM-specifikus |
| Legacy `lib/vedettmunka/data.ts` | VM-specifikus adatfüggvények |
| Legacy `lib/vedettmunka/types.ts` | VM-specifikus TypeScript típusok |
| Legacy `lib/vedettmunka/attributes.ts` | VM-specifikus attribútum rendszer |
| Legacy `lib/vedettmunka/categories.ts` | VM-specifikus kategóriák |
| Legacy VmIcon.tsx / VmAttributeChip.tsx | VM-specifikus piktogram rendszer |
| Legacy UI information architecture másolása | Pl. 7-lépéses VM wizard → VK wizard |
| Legacy `open_to_*` boolean mezők mint VKMM alap | Eltérő VKMM boolean modell |

---

## Szürke zóna – döntést igényel Sprint 1 előtt

| Elem | Helyzet | Ajánlás |
|---|---|---|
| `employers` tábla reuse | Technikai mezők reuse-olhatók (id, user_id, status) | Ownership lookup technikailag OK; business mezők NEM |
| Admin oldal layout | Ha generikus admin shell – reuse-olható | Ha VM-specifikus tartalom – NEM |
| `profiles` tábla `role` mező | Generic admin role check – reuse-olható | ✅ Reuse OK |

---

## Git History szabály

A clean-room elv NEM jelenti a history törlését.
Minden korábbi commit megmarad.
Rebase / squash tilott a history eltüntetése céljából.
