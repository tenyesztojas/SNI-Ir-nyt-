# Unit Test Matrix – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – O. fejezet + errata
**Státusz:** Sprint 0.5 sign-off – tesztek listája lezárt; implementáció Sprint 1-ben kezdődik

---

## O.1 HIGHER_IS_MORE_DEMANDING (HI) handler

| # | Bemenet (emp / prefMax / accMax / importance) | Elvárt eredmény |
|---|---|---|
| 1 | emp=null | UNKNOWN |
| 2 | emp=3, prefMax=null | CLARIFY |
| 3 | emp=3, prefMax=4, accMax=5, imp=low | STRONG_FIT |
| 4 | emp=3, prefMax=4, accMax=5, imp=high | STRONG_FIT |
| 5 | emp=4, prefMax=4, accMax=5, imp=low | STRONG_FIT |
| 6 | emp=5, prefMax=4, accMax=5, imp=medium | ACCEPTABLE |
| 7 | emp=5, prefMax=4, accMax=5, imp=high | CLARIFY |
| 8 | emp=5, prefMax=4, accMax=5, imp=essential | CLARIFY |
| 9 | emp=6, prefMax=4, accMax=5, imp=low | LOAD_POINT |
| 10 | emp=6, prefMax=4, accMax=5, imp=high | LOAD_POINT |
| 11 | emp=6, prefMax=4, accMax=5, imp=essential | LOAD_POINT |

**INV-3 ellenőrzés:** sorok 9–11 mind LOAD_POINT, importance-tól függetlenül.

---

## O.2 RANGE_PREFERENCE (RP) handler

| # | Bemenet | Elvárt eredmény |
|---|---|---|
| 1 | emp=null | UNKNOWN |
| 2 | pref=null (hiányos user adat) | CLARIFY |
| 3 | emp=3, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=low | STRONG_FIT |
| 4 | emp=1, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=low | ACCEPTABLE |
| 5 | emp=1, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=high | CLARIFY |
| 6 | emp=5, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=medium | ACCEPTABLE |
| 7 | emp=5, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=essential | CLARIFY |
| 8 | emp=0, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=low | LOAD_POINT |
| 9 | emp=6, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=high | LOAD_POINT |
| 10 | emp=6, prefMin=2, prefMax=4, accMin=1, accMax=5, imp=essential | LOAD_POINT |

---

## O.3 SET_MEMBERSHIP (SM) handler

| # | Bemenet | Elvárt eredmény |
|---|---|---|
| 1 | emp=null | UNKNOWN |
| 2 | preferred=[], acceptable=[] | CLARIFY |
| 3 | emp='A', preferred=['A','B'], acc=['A','B','C'] | STRONG_FIT |
| 4 | emp='C', preferred=['A','B'], acc=['A','B','C'], imp=low | ACCEPTABLE |
| 5 | emp='C', preferred=['A','B'], acc=['A','B','C'], imp=high | CLARIFY |
| 6 | emp='D', preferred=['A','B'], acc=['A','B','C'], imp=low | LOAD_POINT |
| 7 | emp='D', preferred=['A','B'], acc=['A','B','C'], imp=high | LOAD_POINT |
| 8 | emp='D', preferred=['A','B'], acc=['A','B','C'], imp=essential | LOAD_POINT |

---

## O.4 BOOLEAN_PREFERENCE (BP) handler

| # | Bemenet | Elvárt eredmény |
|---|---|---|
| 1 | emp=null | UNKNOWN |
| 2 | preferred=null (indifferent), emp=true | ACCEPTABLE |
| 3 | preferred=null (indifferent), emp=false | ACCEPTABLE |
| 4 | preferred=true, acc=[true], emp=true | STRONG_FIT |
| 5 | preferred=false, acc=[false], emp=false | STRONG_FIT |
| 6 | preferred=true, acc=[true,false], emp=false, imp=low | ACCEPTABLE |
| 7 | preferred=true, acc=[true,false], emp=false, imp=high | CLARIFY |
| 8 | preferred=true, acc=[true], emp=false, imp=low | LOAD_POINT |
| 9 | preferred=true, acc=[true], emp=false, imp=high | LOAD_POINT |
| 10 | preferred=true, acc=[true], emp=false, imp=essential | LOAD_POINT |
| 11 | boolean_value=false, employer null check | NOT UNKNOWN (INV-9) |

**INV-4 (boolean indifferent → ACCEPTABLE, soha nem STRONG_FIT):** sorok 2–3.
**INV-3 (LOAD_POINT importance-független):** sorok 8–10.
**INV-9 (boolean false = valid):** sor 11.

---

## O.5 FREQUENCY_RANGE (FR) handler

| # | Bemenet | Elvárt eredmény |
|---|---|---|
| 1 | emp=null | UNKNOWN |
| 2 | user pref=null | CLARIFY |
| 3 | emp=idx2, prefMin=idx1, prefMax=idx3 (in range) | STRONG_FIT |
| 4 | emp=idx0, prefMin=idx1, prefMax=idx3, accMin=idx0, accMax=idx4, imp=low | ACCEPTABLE |
| 5 | emp=idx0, prefMin=idx1, prefMax=idx3, accMin=idx0, accMax=idx4, imp=high | CLARIFY |
| 6 | emp=idx5, prefMin=idx1, prefMax=idx3, accMin=idx0, accMax=idx4, imp=low | LOAD_POINT |
| 7 | emp=idx5, ..., imp=medium | LOAD_POINT |
| 8 | emp=idx5, ..., imp=high | LOAD_POINT |

*idx = pozicionális index a frequency_options_json tömbből*

---

## O.6 Compatibility Invariant Tests

Minden handler-tesztnél ellenőrizendő invariánsok:

| # | Invariáns | Teszt leírás |
|---|---|---|
| INV-1 | Outside acceptable → soha nem ACCEPTABLE | Minden handler: outside range → nem ACCEPTABLE |
| INV-2 | Outside acceptable → soha nem STRONG_FIT | Minden handler: outside range → nem STRONG_FIT |
| INV-3 | Outside acceptable → mindig LOAD_POINT | Minden handler: outside range + minden importance → LOAD_POINT |
| INV-4 | Importance nem enyhíthet LOAD_POINT-ot | low/medium/high/essential outside → mind LOAD_POINT |
| INV-5 | Boolean indifferent → ACCEPTABLE | preferred_boolean=null → ACCEPTABLE |
| INV-6 | Boolean indifferent → soha nem STRONG_FIT | preferred_boolean=null → nem STRONG_FIT |
| INV-7 | Missing employer → UNKNOWN | employerVal=null → UNKNOWN |
| INV-8 | SELF_REPORTED nem okoz UNKNOWN-t | data_source='SELF_REPORTED' de érték megvan → nem UNKNOWN |

---

## Tesztfájlok (tervezett, Sprint 1-ben implementálandó)

```
__tests__/vedett-karrier/compatibility/
  compareHigherDemand.test.ts
  compareRangePreference.test.ts
  compareSetMembership.test.ts
  compareBooleanPreference.test.ts
  compareFrequencyRange.test.ts
  invariants.test.ts
```
