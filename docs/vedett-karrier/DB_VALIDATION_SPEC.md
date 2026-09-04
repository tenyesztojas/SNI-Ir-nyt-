# DB Validation Spec – Védett Karrier

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – D.10 fejezet + errata
**Státusz:** Sprint 0.5 sign-off dokumentum
**FONTOS: Ez specifikáció – migration SQL NEM kerül most megírásra.**

---

## 1. Trigger: `validate_job_role_env_value_type()`

**Trigger neve:** `validate_job_role_env_value_type`
**Esemény:** `BEFORE INSERT OR UPDATE`
**Tábla:** `job_role_env_values`
**Hatás on failure:** `RAISE EXCEPTION`

### Logika

```
1. Lekérdezi a sub_dimension comparison_type-ját a sub_dimension_id alapján
2. Meghatározza az elvárt value_type-ot (comparison_type → value_type mapping)
3. Ellenőrzi, hogy pontosan az elvárt typed oszlop nem-null
4. Ellenőrzi az értéktartomány érvényességét
5. RAISE EXCEPTION ha bármelyik feltétel sérül
```

### comparison_type → value_type megfeleltetés

| comparison_type | Elvárt value_type | Nem-null oszlop |
|---|---|---|
| `HIGHER_IS_MORE_DEMANDING` | ordinal | `ordinal_value` |
| `RANGE_PREFERENCE` | ordinal | `ordinal_value` |
| `SET_MEMBERSHIP` | categorical | `categorical_value` |
| `BOOLEAN_PREFERENCE` | boolean | `boolean_value` |
| `FREQUENCY_RANGE` | frequency | `frequency_value` |

### Ellenőrzések típusonként

#### ORDINAL (HI, RP)
- `ordinal_value IS NOT NULL` – az érték megadott
- `categorical_value IS NULL AND boolean_value IS NULL AND frequency_value IS NULL` – más oszlop null
- `ordinal_value >= sub_dim.ordinal_min AND ordinal_value <= sub_dim.ordinal_max` – tartomány (általában 1–5)

#### CATEGORICAL (SM)
- `categorical_value IS NOT NULL`
- Többi oszlop NULL
- `categorical_value = ANY(sub_dim.categorical_options_json)` – az érték szerepel az allowed listán
- `categorical_options_json` nem üres

#### BOOLEAN (BP)
- `boolean_value IS NOT NULL` – FONTOS: `false` értéke IS NOT NULL, érvényes!
- Többi oszlop NULL
- Boolean típus implicit érvényes (true / false) – nincs további domain check

#### FREQUENCY (FR)
- `frequency_value IS NOT NULL`
- Többi oszlop NULL
- `frequency_value = ANY(sub_dim.frequency_options_json)` – az érték szerepel az allowed listán
- `frequency_options_json` nem üres

### boolean_value = false explicit kezelés

```
-- HELYES ellenőrzés (alkalmazáskódban is):
IF NEW.boolean_value IS NULL THEN
  RAISE EXCEPTION 'boolean_value nem lehet NULL BOOLEAN_PREFERENCE típusnál';
END IF;

-- HELYTELEN (soha ne használd):
-- IF NOT NEW.boolean_value THEN  ← false értékre TÉVESEN tüzel
```

---

## 2. Trigger: `validate_career_profile_dimension_type()`

**Trigger neve:** `validate_career_profile_dimension_type`
**Esemény:** `BEFORE INSERT OR UPDATE`
**Tábla:** `career_profile_dimensions`
**Hatás on failure:** `RAISE EXCEPTION`

### Logika

```
1. Lekérdezi a sub_dimension comparison_type-ját
2. Ellenőrzi, hogy a megadott felhasználói mezők konzisztensek a comparison_type-tal
3. HI esetén: csak preferred_max_value és acceptable_max_value megengedett (preferred_min nem releváns)
4. RP esetén: mind a 4 mező (preferred_min, preferred_max, acceptable_min, acceptable_max) szükséges
5. SM esetén: preferred_categories_json és acceptable_categories_json JSON tömbök
6. BP esetén: preferred_boolean (null megengedett = közömbös), acceptable_boolean_values JSON tömb
7. FR esetén: preferred_min/max_frequency, acceptable_min/max_frequency
8. RAISE EXCEPTION ha típus nem egyezik
```

### Preferred ⊆ Acceptable ellenőrzés

- RP esetén: `preferred_min >= acceptable_min AND preferred_max <= acceptable_max`
- SM esetén: `preferred_categories ⊆ acceptable_categories`
- FR esetén: a frequency ordering pozicionális index alapján; `preferred_min_idx >= acceptable_min_idx AND preferred_max_idx <= acceptable_max_idx`
- BP esetén: ha `preferred_boolean != null`, akkor `preferred_boolean ∈ acceptable_boolean_values`

### HI input modell (max-only)

```sql
-- HELYES: HI csak max threshold-okat tárol
preferred_max_value   smallint nullable  -- user comfortable threshold
acceptable_max_value  smallint nullable  -- user stretch threshold

-- NEM SZEREPEL HI-nál:
-- preferred_min_value  ← NEM RELEVÁNS HI-nál
-- acceptable_min_value ← NEM RELEVÁNS HI-nál
```

---

## 3. Alkalmazásszintű validáció (Defense in Depth)

A DB triggerek mellett az alkalmazáskód is validál:

- Server Actionben: typed value explicit null-check (`=== null || === undefined`, soha nem `!value`)
- Seed validator: `validateVkmmSeed()` – 17 ellenőrzés (ld. SEED_VALIDATOR_SPEC.md)
- TypeScript discriminated union típusok: compile-time type safety

---

## 4. Megjegyzés

A trigger SQL kód megírása a Sprint 1 migráció feladata.
Ez a dokumentum a trigger specifikáció – nem a migration fájl.
