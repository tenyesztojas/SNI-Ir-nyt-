# VKMM Typed Model Sign-Off

**Dátum:** 2026-09-03
**Forrás:** Technical Implementation Plan V1.1 FINAL – B., C., D. fejezetek + errata
**Státusz:** Sprint 0.5 sign-off – LEZÁRT

---

## Comparison Type × Value Type Megfeleltetés

| comparison_type | value_type | DB oszlop | Felhasználói input |
|---|---|---|---|
| `HIGHER_IS_MORE_DEMANDING` (HI) | ordinal | `ordinal_value smallint` | Max-only: `preferred_max_value` + `acceptable_max_value` |
| `RANGE_PREFERENCE` (RP) | ordinal | `ordinal_value smallint` | 4 mező: `preferred_min`, `preferred_max`, `acceptable_min`, `acceptable_max` |
| `SET_MEMBERSHIP` (SM) | categorical | `categorical_value text` | `preferred_categories_json`, `acceptable_categories_json` |
| `BOOLEAN_PREFERENCE` (BP) | boolean | `boolean_value boolean` | `preferred_boolean` (null = indifferent), `acceptable_boolean_values` |
| `FREQUENCY_RANGE` (FR) | frequency | `frequency_value text` | 4 mező: `preferred_min/max_frequency`, `acceptable_min/max_frequency` |

---

## DB Tábla: `job_role_env_values`

```sql
CREATE TABLE job_role_env_values (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_role_id       uuid REFERENCES vk_job_roles(id) ON DELETE CASCADE NOT NULL,
  sub_dimension_id  uuid REFERENCES vkmm_sub_dimensions(id) NOT NULL,
  ordinal_value     smallint,
  categorical_value text,
  boolean_value     boolean,   -- false IS a valid value
  frequency_value   text,
  data_source       text NOT NULL DEFAULT 'SELF_REPORTED'
                    CHECK (data_source IN ('CONFIRMED','SELF_REPORTED')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exactly_one_value CHECK (
    (ordinal_value IS NOT NULL)::int +
    (categorical_value IS NOT NULL)::int +
    (boolean_value IS NOT NULL)::int +
    (frequency_value IS NOT NULL)::int = 1
  )
);
```

---

## Kritikus megállapítások

### ✅ Nincs polymorphic `intensity_value text` mező
Explicit döntés (ADR-002). Az egyetlen typed oszlop nullázódik, a többi NULL.

### ✅ Nincs `value_type` oszlop a `job_role_env_values` táblában
A `value_type` az aldimenzió-metaadatból olvasható (`vkmm_sub_dimensions.comparison_type` → implicit value_type mapping).

### ✅ `boolean_value = false` explicit valid érték
A CHECK constraint `boolean_value IS NOT NULL` feltétele `false`-ra is teljesül.
Az alkalmazás kódjában `=== null || === undefined` ellenőrzés (nem falsy check).

### ✅ Frequency ordering pozicionális index alapján
A frekvencia értékek sorrendje a `frequency_options_json` tömbből vett pozicionális index, nem alfabetikus string-összehasonlítás.

---

## TypeScript Discriminated Union Típusok

```typescript
// Employer side
type OrdinalEmployerValue = { type: 'ordinal'; value: number; dataSource: DataSource }
type CategoricalEmployerValue = { type: 'categorical'; value: string; dataSource: DataSource }
type BooleanEmployerValue = { type: 'boolean'; value: boolean; dataSource: DataSource }
type FrequencyEmployerValue = { type: 'frequency'; value: string; dataSource: DataSource }
type EmployerDimensionValue =
  | OrdinalEmployerValue
  | CategoricalEmployerValue
  | BooleanEmployerValue
  | FrequencyEmployerValue
  | null

// User side
type OrdinalUserPreference = { type: 'ordinal'; comparison: 'HI' | 'RP'; ... }
type SetUserPreference = { type: 'categorical'; preferredCategories: string[]; ... }
type BooleanUserPreference = { type: 'boolean'; preferredBoolean: boolean | null; ... }
type FrequencyUserPreference = { type: 'frequency'; ... }
type UserDimensionPreference =
  | OrdinalUserPreference
  | SetUserPreference
  | BooleanUserPreference
  | FrequencyUserPreference
```

---

## Sign-Off

A VKMM typed model specifikáció lezárt. Implementáció előtt nem módosítható az alapterv.
Módosítás csak új ADR + V2.2.1 termékkoncepció módosítási kérelemmel lehetséges.
