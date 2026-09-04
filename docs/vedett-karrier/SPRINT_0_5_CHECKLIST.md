# Sprint 0.5 Checklist – Technical Foundation Freeze

**Dátum:** 2026-09-03
**Státusz:** Completed

---

| TASK | STATUS | EVIDENCE | FILE | BLOCKER | SIGN-OFF |
|---|---|---|---|---|---|
| 0.5.1 DESIGN_ORIGIN.md létrehozása | DONE | Fájl létrehozva | `docs/vedett-karrier/DESIGN_ORIGIN.md` | — | ✅ |
| 0.5.2 ADR-001 (/vedett-karrier namespace) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-001.md` | — | ✅ |
| 0.5.3 ADR-002 (Typed value model) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-002.md` | — | ✅ |
| 0.5.4 ADR-003 (No total score) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-003.md` | — | ✅ |
| 0.5.5 ADR-004 (Compatibility user-only) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-004.md` | — | ✅ |
| 0.5.6 ADR-005 (Career Discovery) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-005.md` | — | ✅ |
| 0.5.7 ADR-006 (Clean-room) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-006.md` | — | ✅ |
| 0.5.8 ADR-007 (External application only) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-007.md` | — | ✅ |
| 0.5.9 ADR-008 (Preferencialap) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-008.md` | — | ✅ |
| 0.5.9b ADR-009 (Deterministic engine) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-009.md` | — | ✅ |
| 0.5.9c ADR-010 (RLS defense-in-depth) | DONE | Fájl létrehozva | `docs/vedett-karrier/adr/ADR-010.md` | — | ✅ |
| 0.5.10 Employers schema audit | DONE | `supabase/migrations/20260829_vedettmunka.sql` ténylegesen olvasva | `docs/vedett-karrier/EMPLOYER_SCHEMA_AUDIT.md` | — | ✅ |
| 0.5.11 DB validation trigger spec | DONE | Fájl létrehozva (spec, nem SQL) | `docs/vedett-karrier/DB_VALIDATION_SPEC.md` | — | ✅ |
| 0.5.12 RLS matrix lezárva | DONE | Fájl létrehozva | `docs/vedett-karrier/RLS_MATRIX.md` | — | ✅ |
| 0.5.13 Authorization matrix lezárva | DONE | Fájl létrehozva | `docs/vedett-karrier/AUTHORIZATION_MATRIX.md` | — | ✅ |
| 0.5.14 VKMM typed model sign-off | DONE | Fájl létrehozva | `docs/vedett-karrier/VKMM_TYPED_MODEL_SIGNOFF.md` | — | ✅ |
| Compatibility invariants lezárva | DONE | 10 invariáns rögzítve | `docs/vedett-karrier/COMPATIBILITY_INVARIANTS.md` | — | ✅ |
| Seed validator spec lezárva | DONE | 17 ellenőrzés rögzítve | `docs/vedett-karrier/SEED_VALIDATOR_SPEC.md` | — | ✅ |
| Career Discovery sign-off | DONE | Display priority szemantika rögzítve | `docs/vedett-karrier/CAREER_DISCOVERY_SIGNOFF.md` | — | ✅ |
| Unit test matrix lezárva | DONE | O.1–O.6 + 8 invariáns | `docs/vedett-karrier/UNIT_TEST_MATRIX.md` | — | ✅ |
| Clean-room boundary dokumentálva | DONE | Fájl létrehozva | `docs/vedett-karrier/CLEAN_ROOM_BOUNDARY.md` | — | ✅ |
| Pre-implementation repository guard | DONE | Repository ellenőrizve, NONE találat | `docs/vedett-karrier/PRE_IMPLEMENTATION_FINDINGS.md` | — | ✅ |

---

## Kritikus blokkerek

**Nincs kritikus blocker.**

## Fennmaradó kockázatok (nem blokker)

| Kockázat | Kezelés |
|---|---|
| `CvSzerkesztoClient.tsx` uncommitted | Legacy VM change – commit ajánlott Sprint 1 előtt; nem érinti VK-t |
| Employer schema reuse szürke zónák | Döntési pontok dokumentálva az EMPLOYER_SCHEMA_AUDIT.md-ben |

---

## Sprint 0.5 Lezárása

**Minden kötelező 0.5.x feladat DONE státuszban.**
**Nincs production DB módosítás.**
**Nincs legacy fájl törlés vagy módosítás.**
**Nincs VK implementáció elindítva.**
