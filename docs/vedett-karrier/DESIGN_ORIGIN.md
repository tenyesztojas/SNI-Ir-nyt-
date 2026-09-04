# Védett Karrier – DESIGN_ORIGIN.md

**Dokumentum létrehozásának dátuma:** 2026-09-03
**Státusz:** Sprint 0.5 Technical Foundation Freeze – lezárt

---

## Hivatkozások

- Termékspecifikáció: `VEDETT_KARRIER_V2_2_1_FINAL.md`
- Technikai terv: `VEDETT_KARRIER_TECHNICAL_IMPL_PLAN_V1_1.md` (erratával együtt)

---

## Termékidentitás

A **Védett Karrier** önálló, új termék.

Definíció: **EMBER + MUNKAKÖRNYEZET + KOMPATIBILITÁS + KARRIERÚT + FENNTARTHATÓ MUNKÁBA ÁLLÁS**

A Védett Karrier:
- NEM álláshirdető portál
- NEM ATS (Applicant Tracking System)
- NEM recruitment platform
- NEM jelölt-adatbázis
- NEM alkalmassági teszt
- NEM diagnosztikai rendszer
- NEM rangsoroló rendszer

---

## Termékkomponensek

| Komponens | Leírás |
|---|---|
| Munkaprofil | A munkavállaló munkakörnyezeti preferenciáinak rögzítése (VKMM) |
| Képességtérkép | Munkaképességek és tapasztalatok strukturált feltérképezése |
| Karrieriránytű | Karrierirányok felfedezése, nem rangsorolás |
| Preferencialap | Determinisztikus, sablonmondatos összefoglaló – privát, PDF |
| Munkapróba | Kipróbálási lehetőség strukturált keretek között |
| Védett Próba | Védett körülmények között zajló munkakipróbálás |
| Workplace preview | Munkahely előzetes megismerése (virtuális vagy helyszíni) |
| Interview preview | Interjúra felkészítő modul |
| 7/30/90 follow-up | Strukturált beilleszkedés-követés munkakezdés után |
| Career Discovery Engine | Munkakörcsaládok felfedezése – display priority, nem suitability ranking |
| Compatibility Engine | Determinisztikus ember–munkakörnyezet kompatibilitás |

---

## B2B Workplace-Tech Modell

A Védett Karrier B2B komponense munkáltatói munkakörnyezet-profilozást tartalmaz.
A munkáltató a saját munkakörnyezetét írja le (VKMM employer side).
A rendszer a felhasználó és a munkakörnyezet kompatibilitását számítja – nem a jelölt alkalmasságát.

Explicit korlát: **a munkáltató NEM lát jelölteket, NEM rangsorolhat, NEM utasíthat el jelöltet a rendszeren keresztül.**

---

## Clean-Room Fejlesztési Elv

### Elválasztás

| Elem | Státusz |
|---|---|
| Legacy `/vedettmunka/*` route-ok | ÉRINTETLEN MARAD |
| Új `/vedett-karrier/*` namespace | ÚJ, önálló fejlesztés |
| Legacy VédettMunka DB táblák | ÉRINTETLEN MARAD |
| Új Védett Karrier DB táblák | ÚJ schema, ÚJ névtér |
| Legacy business logic | NEM reuse-olható |
| Generikus infrastruktúra | MEGENGEDETT reuse |

### Generikus infrastruktúra – reuse megengedett

- Supabase kliens setup (`lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`)
- Auth helperek (session kezelés, middleware auth check)
- Shared UI primitívek (Button, Modal, Input, Form generikus komponensek)
- Storage infrastruktúra (Supabase Storage bucket reuse)
- Email infrastruktúra (Resend wrapper `lib/resend.ts`)
- Generic admin auth utilities
- Logging infrastruktúra
- Accessibility helperek

### Legacy business logic – reuse TILTOTT

- Legacy VédettMunka business taxonomy (mezőnevek, kérdésstruktúrák)
- Legacy munkakörnyezet-leírás wording és terminológia
- Legacy álláshirdetési workflow
- Legacy önéletrajz/CV workflow mint új Karrier alap
- Legacy jelentkezési flow mint új Karrier alap
- Legacy munkáltatói csomag logika
- Legacy munkakörnyezeti mezőlista egyszerű átnevezése
- Legacy UI information architecture másolása
- Legacy alkalmassági/szűrési logika

---

## Route Namespace Elválasztás

```
/vedettmunka/*   → LEGACY, érintetlen marad
/vedett-karrier/* → ÚJ, Védett Karrier V2
```

---

## Adatmodell Elválasztás

Az összes új Védett Karrier adat tábla új, önálló schema-elemként jön létre.
A meglévő `employers`, `job_posts`, `job_applications_log` stb. táblák **NEM** az új Védett Karrier alapjai – csak ahol explicit reuse engedélyezett (pl. employer ownership lookup technikai célra).

---

## VKMM Módszertan

A **Védett Karrier Munkakörnyezeti Modell (VKMM)** 10 dimenzió, 51 aldimenzió strukturált, typed modellje.

5 comparison_type:
- `HIGHER_IS_MORE_DEMANDING` (HI) → ordinal
- `RANGE_PREFERENCE` (RP) → ordinal
- `SET_MEMBERSHIP` (SM) → categorical
- `BOOLEAN_PREFERENCE` (BP) → boolean
- `FREQUENCY_RANGE` (FR) → frequency

A kompatibilitás determinisztikus, szerver-oldali, AI-mentes.

---

## Git History Megőrzési Szabály

A korábbi fejlesztési történet megőrzendő.
Semmit nem szabad azért törölni, átírni, squash-olni vagy rebase-elni,
hogy korábbi fejlesztési história eltűnjön.
Ez a szabály kötelező érvényű az összes Sprint során.
