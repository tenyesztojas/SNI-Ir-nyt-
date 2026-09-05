# TASK #273.2 — MUNKAPROFIL INTERACTION FIX REPORT

Dátum: 2026-09-05
Branch: local (NEM commitolva, NEM pusholva, NEM deployolva)

---

## ROOT CAUSE

**Hardkódolt, nem egyedi `name` attribútumok a wizard radio inputjain.**

### Mechanizmus

A `DimensionStep` komponens egy fő dimenzión belül egyszerre rendereli az összes sub-dimenzió `SubDimCard` kártyáját (pl. az `env` dimenzióban 6 kártya jelenik meg egyszerre).

Minden `SubDimCard` tartalmaz egy `ImportanceSelect`-et (4 radio gomb: Kevésbé fontos / Fontos / Nagyon fontos / Elengedhetetlen).

Az `ImportanceSelect` korábban hardkódoltan `name="importance"` attribútumot használt. Ez azt jelenti, hogy az oldalon lévő **összes importance radio input** (pl. 6 kártya × 4 opció = 24 input) egyetlen böngészőszintű radio csoportba esett.

**HTML radio csoport szabály:** azonos `name` attribútumú radio inputok között a böngésző csak EGY-et enged aktívnak egyszerre.

**Következmény:**
- Alapállapotban minden kártya `importanceLevel: 'medium'` (="Fontos") — 6 radio input `checked={true}` állapotban van ugyanabban a csoportban
- A böngésző érvénytelen HTML-nek tekinti, és az utolsó `checked` elemet jeleníti meg vizuálisan aktívként
- Amikor a felhasználó rákattint pl. „Nagyon fontos"-ra az 1. kártyán:
  1. React `onChange` lefut → React state helyesen `'high'`-ra frissül az 1. kártyán
  2. React reconciliation: az 1. kártya „Nagyon fontos" `checked=true`, a 2–6. kártyák „Fontos" `checked=true`
  3. **Böngésző felülírja:** a csoport csak egy aktív radiot enged → a DOM-ban az utolsó `checked` elem „nyeri"
  4. Vizuálisan: az 1. kártya radio visszaáll, semmi sem látszik változni

A felhasználó azt tapasztalja, hogy „a kattintásnak nincs hatása."

**Ugyanez a hiba:** `BooleanInput` — `name="boolean-choice"` szintén megosztott volt az összes `BOOLEAN_PREFERENCE` típusú sub-dimenzió kártya közt.

---

## CLIENT BOUNDARY FINDINGS

| Komponens | `'use client'` | Importál server-only modult? |
|-----------|----------------|------------------------------|
| `MunkaprofilWizard.tsx` | ✅ | ✗ |
| `DimensionStep.tsx` | ✅ | ✗ |
| `ImportanceSelect.tsx` | ✅ | ✗ |
| `BooleanInput.tsx` | ✅ | ✗ |
| `OrdinalInput.tsx` | ✅ | ✗ |
| `CategoricalInput.tsx` | ✅ | ✗ |
| `FrequencyInput.tsx` | ✅ | ✗ |
| `profile/summary.ts` | — | ✗ (pure function) |
| `profile/completion.ts` | — | ✗ (kommentben van a hash.server hivatkozás) |
| `profile/actions.ts` | `'use server'` | ✅ (szerver oldalon) |
| `profile/data.ts` | — | ✅ (szerver oldalon) |
| `profile/hash.server.ts` | — | ✅ (szerver oldalon, dynamic import) |

**Megállapítás:** nincs server-only modul szivárgás a kliens bundlebe.

---

## HYDRATION FINDINGS

Nincs azonosított hydration mismatch. A wizard state lazy initializer azonos kimenetet ad szerveren és kliensen:
- `savedRows` JSON-serializálható (string, number, boolean, null, array)
- `VKMM_SEED` statikus, nem tartalmaz nem-serializálható értékeket
- Nincs `Date`, `Math.random()`, `window`, `localStorage` az első renderben

---

## STATE FINDINGS

A React state frissítési lánc helyes:
```
CategoricalInput/OrdinalInput/etc.
  → onChange(newValue)
  → SubDimCard.handleValueChange()
  → onChange({ ...state, value, dirty: true })
  → DimensionStep: onStateChange(sub.code, next)
  → MunkaprofilWizard.handleStateChange()
  → setSubStates(prev => ({ ...prev, [code]: next }))
  → re-render ✓
```

A `generateProfileSummary` minden rendernél lefut (52 sub-dim × 1 pass) — ebből nem keletkezik hiba, de perf-optimalizálásra alkalmas (scope-on kívül).

---

## INPUT FINDINGS

| Input típus | Volt hibás? | Oka | Fix |
|-------------|------------|-----|-----|
| `ImportanceSelect` (radio) | ✅ IGEN | `name="importance"` megosztott | `name={`importance-${sub.code}`}` |
| `BooleanInput` (radio) | ✅ IGEN | `name="boolean-choice"` megosztott | `name={`bp-${sub.code}`}` |
| `CategoricalInput` (buttons) | ✗ NEM | — | érintetlen |
| `OrdinalInput` (range slider) | ✗ NEM | — | érintetlen |
| `FrequencyInput` (select) | ✗ NEM | — | érintetlen |
| textarea (privát megjegyzés) | ✗ NEM | — | érintetlen |
| "Nem tudom" checkbox | ✗ NEM | — | érintetlen |

---

## SAVE FINDINGS

A Mentés gomb **tervszerűen disabled** amíg nincs `dirty: true` sub-dim state (`disabled={isSaving || !hasDirty}`). Ez NEM hiba — a save logika helyes.

---

## NEXT FINDINGS

A Következő gomb (`disabled={isSaving}`, alapból `false`) helyes. `goToNext()` lefut, dirty state-et ment, majd `setCurrentDimIdx(i => i + 1)`. Funkcionálisan helyes volt.

---

## MODIFIED FILES

| Fájl | Változás |
|------|---------|
| `components/vedett-karrier/wizard/ImportanceSelect.tsx` | `name: string` prop hozzáadva; `name="importance"` → `name={name}` |
| `components/vedett-karrier/wizard/inputs/BooleanInput.tsx` | `name: string` prop hozzáadva; `name="boolean-choice"` → `name={name}` |
| `components/vedett-karrier/wizard/DimensionStep.tsx` | `ImportanceSelect`-nek `name={`importance-${sub.code}`}`; `BooleanInput`-nak `name={`bp-${sub.code}`}` |
| `__tests__/vedett-karrier/munkaprofil-interaction-273-2.test.ts` | **ÚJ** — 24 regressziós teszt |

---

## AUTH REGRESSION

| Tesztfájl | PASS |
|-----------|------|
| `auth-273-1.test.ts` (33 teszt) | ✅ 33/33 |
| `integration-273.test.ts` (28 teszt) | ✅ 28/28 |

---

## TEST RESULTS

```
munkaprofil-interaction-273-2.test.ts:
# tests 24
# suites 8
# pass  24
# fail   0

Összesen: 85/85 PASS
```

---

## TSC

```
npx tsc --noEmit → (no output — 0 error)
```

---

## BUILD

Build sandbox nem elérhető ebben a munkamenetben (nincs futó Next.js dev/build env). A tsc PASS + korábbi build regressziók alapján nincs ismert build blocker.

---

## SCOPE CONTROL

Ebben a taskban NEM módosult:
- VKMM üzleti logika
- Compatibility semantics
- DB / RLS / migration
- Server actions
- Auth flow
- Employer wizard komponensek (`components/vedett-karrier/employer/`)
- Legacy kód

---

## TASK #273.2 — GO FOR MANUAL REVIEW

A kézi ellenőrzőlista a masterprompt 17. szakasza szerint:
1. Zajszint slider mozog
2. Megvilágítás slider mozog
3. Vizuális tér slider mozog
4. Nyugodt/ingermentes slider mozog
5. Hőmérséklet: Preferált + OK kattintható
6. Munkaterület típusa: Preferált + OK kattintható
7. **Importance: mind a 4 opció vizuálisan váltható** ← ez volt a primary bug
8. Nem tudom checkbox működik
9. Saját megjegyzésbe lehet írni
10. Mentés működik (dirty state után)
11. Következő átvisz a 2. dimenzióra
12. Visszatérés után mentett state megmarad

COMMIT, PUSH ÉS DEPLOY NEM TÖRTÉNT.
