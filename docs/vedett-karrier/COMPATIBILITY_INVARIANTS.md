# Compatibility Invariants – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – O.6 + errata
**Státusz:** Sprint 0.5 sign-off – LEZÁRT

---

## Kötelező invariánsok

Ezek az invariánsok minden comparison_type-ra, minden handler-re kötelezően érvényesek.
Az implementáció során minden unit tesztnek le kell fednie ezeket.

| # | Invariáns | Leírás |
|---|---|---|
| INV-1 | **Outside acceptable → soha nem ACCEPTABLE** | Ha az employer értéke kívül esik az acceptable tartományon, az eredmény NEM lehet ACCEPTABLE, függetlenül az importance értékétől |
| INV-2 | **Outside acceptable → soha nem STRONG_FIT** | Ha az employer értéke kívül esik az acceptable tartományon, az eredmény NEM lehet STRONG_FIT |
| INV-3 | **Outside acceptable → mindig LOAD_POINT** | Ha az employer értéke kívül esik az acceptable tartományon, az eredmény LOAD_POINT – importance értékétől FÜGGETLEN |
| INV-4 | **Importance nem enyhíthet LOAD_POINT-ot** | A `low`, `medium`, `high`, `essential` importance NEM változtathatja meg a LOAD_POINT-ot más eredményre |
| INV-5 | **Boolean indifferent → ACCEPTABLE** | Ha `preferred_boolean = null` (közömbös), az eredmény ACCEPTABLE, NEM STRONG_FIT |
| INV-6 | **Boolean indifferent → soha nem STRONG_FIT** | `preferred_boolean = null` esetén az eredmény NEM lehet STRONG_FIT |
| INV-7 | **Missing employer → UNKNOWN** | Ha `employerVal === null`, az eredmény UNKNOWN (nincs employer adat) |
| INV-8 | **SELF_REPORTED önmagában nem okoz UNKNOWN-t** | A `data_source = 'SELF_REPORTED'` önmagában NEM okoz UNKNOWN státuszt; csak az adat hiánya okoz UNKNOWN-t |
| INV-9 | **Boolean false érvényes employer érték** | `boolean_value = false` NEM minősül missing value-nak; az alkalmazáskód explicit `=== null || === undefined` ellenőrzést használ |
| INV-10 | **Invalid categorical/frequency code → validation error** | Ha az employer categorical vagy frequency értéke nem szerepel az allowed domain-ben, az eredmény NEM compatibility result, hanem validation error |

---

## Importance szerepe – pontosítás

Az `importance` (low / medium / high / essential) kizárólag az **acceptable zónában** érvényesül:

```
employer ≤ preferred_max    → STRONG_FIT  (importance-független)
preferred_max < emp ≤ acc_max:
  importance ∈ {high, essential} → CLARIFY
  importance ∈ {low, medium}     → ACCEPTABLE
emp > acc_max               → LOAD_POINT  (importance-FÜGGETLEN)
```

Az importance **soha nem** enyhíthet LOAD_POINT-ot, és **soha nem** erősíthet STRONG_FIT-et.

---

## Compatibility Status Szemantika

| Státusz | Jelentés |
|---|---|
| `STRONG_FIT` | Employer értéke az explicitly preferred zónában van |
| `ACCEPTABLE` | Employer értéke az acceptable (de nem preferred) zónában van; vagy felhasználó közömbös |
| `CLARIFY` | Az adat pontosítást igényel; VAGY acceptable zóna + high/essential importance |
| `LOAD_POINT` | Employer értéke kívül esik az acceptable tartományon – MINDIG, importance-független |
| `UNKNOWN` | Nincs elegendő adat a számításhoz |

---

## data_confidence (független a státusztól)

| Érték | Feltétel |
|---|---|
| `CONFIRMED` | Employer adat megerősített forrásból |
| `SELF_REPORTED` | Employer saját bevallása (NEM okoz automatikusan UNKNOWN-t) |
| `MISSING` | Nincs employer adat → UNKNOWN státusz |

---

## Sign-Off

Az invariánsok lezártak. Minden Sprint implementációs fázisban a unit test mátrix (O. fejezet) ezekre az invariánsokra épül. Az invariáns-sértés az adott handler automated tesztjét töri – ez szándékos és kívánt.
