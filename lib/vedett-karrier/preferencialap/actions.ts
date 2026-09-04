'use server'
/**
 * Védett Karrier – Preferencialap Server Actions
 * Sprint 6
 *
 * KRITIKUS:
 * - Csak a user saját dokumentumait kezeli
 * - Employer NEM fér hozzá (RLS backstop: nincs employer policy)
 * - Determinisztikus szöveg: nincs AI hívás
 * - User explicit dönt a megosztásról
 * - service_role key soha nem kerül kliensre
 */

import { createClient } from '../../supabase/server'
import { loadSavedDimensions } from '../profile/data'
import { VKMM_SUB_DIMENSIONS } from '../seed/vkmm-seed'
import {
  generatePreferenceDimensionBlocks,
  buildPreferenceDocumentText,
} from './template'
import {
  upsertPreferenceDocument,
  sharePreferenceDocument,
  unsharePreferenceDocument,
  deletePreferenceDocument as dbDelete,
} from './data'
import type {
  PreferenceDocumentActionResult,
  GeneratePreferenceDocumentInput,
  SavePreferenceDocumentInput,
} from '../types/preferencialap'

// ─────────────────────────────────────────────────────────────────────────────
// generateAndSavePreferenceDocument
// ─────────────────────────────────────────────────────────────────────────────

export async function generateAndSavePreferenceDocument(
  input: SavePreferenceDocumentInput,
): Promise<PreferenceDocumentActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  // Karrierprofil ownership check
  const { data: profile, error: profErr } = await supabase
    .from('career_profiles')
    .select('id')
    .eq('id', input.careerProfileId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (profErr || !profile) {
    return { ok: false, error: 'A karrierprofil nem található vagy nincs jogosultság.' }
  }

  if (input.selectedDimensionCodes.length === 0) {
    return { ok: false, error: 'Legalább egy dimenziót ki kell választani.' }
  }
  if (input.selectedDimensionCodes.length > 40) {
    return { ok: false, error: 'Legfeljebb 40 dimenzió választható.' }
  }

  // Betöltjük a user dimenzióit – NEM kerül munkáltatóhoz
  let savedRows
  try {
    savedRows = await loadSavedDimensions(input.careerProfileId)
  } catch {
    return { ok: false, error: 'A dimenziók betöltése sikertelen.' }
  }

  const activeSubs = VKMM_SUB_DIMENSIONS.filter(s => s.is_active)

  // Determinisztikus szöveggenerálás (NEM AI)
  const blocks = generatePreferenceDimensionBlocks(
    input.selectedDimensionCodes,
    savedRows,
    activeSubs,
  )

  const title  = input.title_hu?.trim() || 'Munkapreferencia-lapom'
  const textHu = buildPreferenceDocumentText(title, blocks)

  try {
    const data = await upsertPreferenceDocument({
      id:                     input.id,
      userId:                 user.id,
      careerProfileId:        input.careerProfileId,
      titleHu:                title,
      selectedDimensionCodes: input.selectedDimensionCodes,
      generatedTextHu:        textHu,
    })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Mentési hiba.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// shareDocument / unshareDocument
// ─────────────────────────────────────────────────────────────────────────────

export async function shareDocument(
  documentId: string,
): Promise<{ ok: boolean; shareToken?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  try {
    const { shareToken } = await sharePreferenceDocument(documentId, user.id)
    return { ok: true, shareToken }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Megosztási hiba.' }
  }
}

export async function unshareDocument(
  documentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  try {
    await unsharePreferenceDocument(documentId, user.id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Hiba.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// deletePreferenceDocument
// ─────────────────────────────────────────────────────────────────────────────

export async function deletePreferenceDocument(
  documentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Bejelentkezés szükséges.' }

  try {
    await dbDelete(documentId, user.id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Törlési hiba.' }
  }
}
