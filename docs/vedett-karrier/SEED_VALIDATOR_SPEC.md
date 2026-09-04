# Seed Validator Spec – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – G. fejezet + errata
**Státusz:** Sprint 0.5 sign-off dokumentum

---

## Általános elvek

- A `validateVkmmSeed()` függvény **FAIL FAST** – az első hibán azonnal leáll
- Részleges VKMM seed nem kerülhet be; minden aldimenziónak jelen kell lennie
- A validator a seed adatot írja le, nem a production DB-t
- Futtatás: minden seedelés előtt kötelező

---

## Kötelező validálási szabályok (17 ellenőrzés)

| # | Szabály | Leírás |
|---|---|---|
| 1 | Dimension count | Pontosan 10 dimenzió van jelen |
| 2 | Sub-dimension count | Pontosan 51 aldimenzió van összesen |
| 3 | Sub-dimensions per dimension | Minden dimenzióhoz legalább 1 aldimenzió tartozik |
| 4 | Sub-dimension codes unique | Minden `sub_dimension_code` egyedi a seedben |
| 5 | Valid comparison_type | Minden aldimenzió `comparison_type` értéke ∈ {`HIGHER_IS_MORE_DEMANDING`, `RANGE_PREFERENCE`, `SET_MEMBERSHIP`, `BOOLEAN_PREFERENCE`, `FREQUENCY_RANGE`} |
| 6 | Ordinal metadata for HI/RP | HI és RP típusú aldimenziók esetén `ordinal_min` és `ordinal_max` mező jelen van |
| 7 | HI/RP ordinal range valid | HI és RP: `ordinal_min = 1` és `ordinal_max = 5` |
| 8 | Categorical metadata for SM | SM típusú aldimenziók esetén `categorical_options_json` mező jelen van |
| 9 | Categorical options non-empty | `categorical_options_json` nem üres tömb |
| 10 | Categorical options unique | `categorical_options_json` elemei egyediek (nincs duplikátum) |
| 11 | Frequency metadata for FR | FR típusú aldimenziók esetén `frequency_options_json` mező jelen van |
| 12 | Frequency options non-empty | `frequency_options_json` nem üres tömb |
| 13 | Frequency options unique | `frequency_options_json` elemei egyediek |
| 14 | Frequency options no extra labels | `frequency_options_json` elemei kizárólag a meghatározott értékkészletből kerülnek ki |
| 15 | Boolean no extra metadata | BP típusú aldimenziók esetén nincs `categorical_options_json` vagy `frequency_options_json` mező |
| 16 | Boolean no ordinal metadata | BP típusú aldimenziók esetén nincs `ordinal_min` vagy `ordinal_max` mező |
| 17 | Deterministic version hash | A seed hash SHA-256 alapú, determinisztikus: sub_dimension_code szerinti sort → normalizálás → stable JSON → SHA-256. Nincs timestamp, nincs random UUID a hashben |

---

## Implementáció struktúra (Sprint 1 feladata)

```typescript
// lib/vedett-karrier/seed/validator.ts

export function validateVkmmSeed(seed: VkmmSeedData): ValidationResult {
  // 1. dimension count
  // 2. sub-dimension count
  // 3. sub-dimensions per dimension
  // 4. unique codes
  // 5. valid comparison_type values
  // 6. ordinal metadata HI/RP
  // 7. ordinal range HI/RP (min=1, max=5)
  // 8. categorical metadata SM
  // 9. categorical non-empty
  // 10. categorical unique
  // 11. frequency metadata FR
  // 12. frequency non-empty
  // 13. frequency unique
  // 14. frequency no extra labels
  // 15. boolean no categorical metadata
  // 16. boolean no ordinal metadata
  // 17. deterministic hash verify

  // FAIL FAST: az első hibán throw
}

export function computeSeedHash(seed: VkmmSeedData): string {
  // sort by sub_dimension_code
  // normalize (stable JSON serialize)
  // SHA-256
}
```

---

## Hibaüzenet elvárások

Minden validációs hiba tartalmaz:
- Hibakód (pl. `VALIDATOR_E01`)
- Leírás (emberi olvasásra)
- Érintett elem (pl. `sub_dimension_code: env_noise`)

Példa:
```
VALIDATOR_E07: HI/RP ordinal range hibás. Elvárás: min=1, max=5. Kapott: env_noise → min=0, max=10
```

---

## Sign-Off

A seed validator 17 ellenőrzése lezárt. Sprint 1 implementáció előtt nem módosítható a spec.
