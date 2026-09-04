# Career Discovery Sign-Off – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – F. fejezet + errata
**Státusz:** Sprint 0.5 sign-off – LEZÁRT

---

## Mi a Career Discovery Engine?

A Career Discovery Engine munkakörcsaládokat mutat a felhasználónak felfedezési célból.
**NEM suitability ranking.**
**NEM alkalmassági értékelés.**
**NEM jelölt-szűrő eszköz.**

---

## Display Priority

A munkakörcsaládok megjelenítési sorrendje determinisztikus **display priority** algoritmuson alapul.

### Az 5 lépéses display priority szabály:

| Lépés | Kritérium |
|---|---|
| 1 | Explicit érdeklődési jelzés (felhasználó megjelölte az adott munkakörcsaládot) |
| 2 | Releváns képességek száma (user_skills ∩ career_family required skills) |
| 3 | Munkakörnyezeti átfedés (az eddigi VKMM adatokból számított, nem kompatibilitási score) |
| 4 | Diverzitási szempont (kisebb munkakörcsaládok esélyegyenlősége) |
| 5 | Stabil tie-breaker (career_family slug szerinti ábécé) |

---

## Display Priority jellemzői

| Tulajdonság | Érték |
|---|---|
| Ephemeral | ✅ Igen – runtime számítás, nem perzisztált |
| Suitability score | ❌ Nem |
| Percentage | ❌ Nem |
| Rank number (#1, #2) | ❌ Nem |
| Employer-visible | ❌ Nem |
| Selection signal | ❌ Nem |
| Persisted user data | ❌ Nem kerül DB-be |
| AI-based | ❌ Nem |

---

## TypeScript típus korlátok

A `CareerDiscoveryResult` (publikus típus) NEM tartalmazhat:
- `score`
- `percentage`
- `rank_score`
- `suitability_score`
- `displayPriority` (number)

A `DiscoveryCandidate` belső struktúra tartalmaz `displayPriorityTuple`-t – ez soha nem kerül a public API-ba.

```typescript
// ✅ HELYES: publikus eredmény típus
interface CareerDiscoveryResult {
  careerFamilyId: string
  careerFamilySlug: string
  careerFamilyName: string
  // ... leírás, tipikus feladatok stb.
  // NEM tartalmaz: score, percentage, rank_score
}

// ❌ TILTOTT: szivárgó belső adat
interface CareerDiscoveryResult {
  score: number          // ← TILTOTT
  rank: number           // ← TILTOTT
  suitabilityPct: number // ← TILTOTT
}
```

---

## UI kötelező szabályok

| Szabály | Megvalósítás |
|---|---|
| Nincs "Top Match" felirat | ✅ Kötelező |
| Nincs #1, #2, #3 számozás | ✅ Kötelező |
| Nincs "legjobb találat" kifejezés | ✅ Kötelező |
| Kötelező felirat | "Ezeket a munkakörcsaládokat érdemes lehet felfedezned." |
| Nincs alkalmassági % | ✅ Kötelező |

---

## Mi NEM a Career Discovery feladata

- Alkalmasság értékelése
- Jelölt-rangsorolás munkáltató számára
- Automatikus ajánlás AI alapján
- Munkáltatói "fit score" generálása

---

## Sign-Off

A Career Discovery Engine specifikációja lezárt. Implementáció nem kezdhető Sprint 0.5-ben.
Sprint 3 feladata a Career Discovery Engine megvalósítása e spec alapján.
