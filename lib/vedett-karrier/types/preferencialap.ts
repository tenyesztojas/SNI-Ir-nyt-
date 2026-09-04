/**
 * Védett Karrier – Preferencialap Types
 * Sprint 6
 *
 * A Preferencialap a user saját munkapreferencia-dokumentuma.
 * - User maga választja ki a dimenziókat
 * - Determinisztikus sablonszöveg (NEM AI)
 * - Privát alapértelmezés; user explicit megoszthatja
 * - NEM önéletrajz, NEM CV, NEM alkalmassági dokumentum
 * - Employer NEM fér hozzá (RLS: nincs employer policy)
 */

// ─────────────────────────────────────────────────────────────────────────────
// DB row
// ─────────────────────────────────────────────────────────────────────────────

export interface PreferenceDocumentRow {
  id:                       string
  user_id:                  string
  career_profile_id:        string
  title_hu:                 string
  selected_dimension_codes: string[]    // aldimenzió kódok (user választja)
  generated_text_hu:        string      // determinisztikus sablon, NEM AI
  is_shared:                boolean
  share_token:              string | null  // uuid, ha shared
  created_at:               string
  updated_at:               string
}

// ─────────────────────────────────────────────────────────────────────────────
// Egy aldimenzió szöveges blokkja a Preferencialapban
// ─────────────────────────────────────────────────────────────────────────────

export interface PreferenceDimensionBlock {
  code:        string   // sub_dimension_code
  label_hu:    string   // az aldimenzió neve magyarul
  text_hu:     string   // determinisztikus sablonszöveg
}

// ─────────────────────────────────────────────────────────────────────────────
// Input for generate + save
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratePreferenceDocumentInput {
  careerProfileId:          string
  selectedDimensionCodes:   string[]
  title_hu?:                string
}

export interface SavePreferenceDocumentInput {
  id?:                      string   // ha update (undefined = create)
  careerProfileId:          string
  title_hu:                 string
  selectedDimensionCodes:   string[]
  generatedTextHu:          string
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Action result wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface PreferenceDocumentActionResult {
  ok:     boolean
  error?: string
  data?:  PreferenceDocumentRow
}
