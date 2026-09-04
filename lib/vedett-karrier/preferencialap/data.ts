/**
 * Védett Karrier – Preferencialap DB Data Access
 * Sprint 6
 *
 * Server-only. Minden függvény server component-ből vagy server action-ből hívható.
 * User csak saját dokumentumait érheti el (RLS backstop).
 * Employer NEM fér hozzá – nincs employer policy a work_preference_documents táblán.
 */

import { createClient } from '../../supabase/server'
import type { PreferenceDocumentRow } from '../types/preferencialap'

// ─────────────────────────────────────────────────────────────────────────────
// Olvasás
// ─────────────────────────────────────────────────────────────────────────────

export async function getPreferenceDocumentsByUser(
  userId: string,
): Promise<PreferenceDocumentRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('work_preference_documents')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`getPreferenceDocumentsByUser: ${error.message}`)
  return (data ?? []).map(row => ({
    ...row,
    selected_dimension_codes: (row.selected_dimension_codes as string[]) ?? [],
  })) as PreferenceDocumentRow[]
}

export async function getPreferenceDocumentById(
  id: string,
  userId: string,
): Promise<PreferenceDocumentRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('work_preference_documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)     // ownership check
    .maybeSingle()
  if (error) throw new Error(`getPreferenceDocumentById: ${error.message}`)
  if (!data) return null
  return {
    ...data,
    selected_dimension_codes: (data.selected_dimension_codes as string[]) ?? [],
  } as PreferenceDocumentRow
}

/** Megosztott dokumentum share_token alapján (anon is elérheti). */
export async function getSharedPreferenceDocument(
  shareToken: string,
): Promise<PreferenceDocumentRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('work_preference_documents')
    .select('*')
    .eq('share_token', shareToken)
    .eq('is_shared', true)
    .maybeSingle()
  if (error) throw new Error(`getSharedPreferenceDocument: ${error.message}`)
  if (!data) return null
  return {
    ...data,
    selected_dimension_codes: (data.selected_dimension_codes as string[]) ?? [],
  } as PreferenceDocumentRow
}

// ─────────────────────────────────────────────────────────────────────────────
// Írás
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertPreferenceDocument(input: {
  id?:                       string
  userId:                    string
  careerProfileId:           string
  titleHu:                   string
  selectedDimensionCodes:    string[]
  generatedTextHu:           string
}): Promise<PreferenceDocumentRow> {
  const supabase = createClient()

  const payload = {
    user_id:                  input.userId,
    career_profile_id:        input.careerProfileId,
    title_hu:                 input.titleHu,
    selected_dimension_codes: input.selectedDimensionCodes,
    generated_text_hu:        input.generatedTextHu,
  }

  if (input.id) {
    // Update: ownership enforced via RLS (user_id = auth.uid())
    const { data, error } = await supabase
      .from('work_preference_documents')
      .update(payload)
      .eq('id', input.id)
      .eq('user_id', input.userId)
      .select()
      .single()
    if (error) throw new Error(`upsertPreferenceDocument (update): ${error.message}`)
    return {
      ...data,
      selected_dimension_codes: (data.selected_dimension_codes as string[]) ?? [],
    } as PreferenceDocumentRow
  } else {
    // Insert
    const { data, error } = await supabase
      .from('work_preference_documents')
      .insert(payload)
      .select()
      .single()
    if (error) throw new Error(`upsertPreferenceDocument (insert): ${error.message}`)
    return {
      ...data,
      selected_dimension_codes: (data.selected_dimension_codes as string[]) ?? [],
    } as PreferenceDocumentRow
  }
}

/** User explicit megosztja a dokumentumát → share_token generálódik. */
export async function sharePreferenceDocument(
  id: string,
  userId: string,
): Promise<{ shareToken: string }> {
  const supabase = createClient()
  // Megjegyzés: gen_random_uuid() PostgreSQL függvénnyel generálunk tokent
  // a supabase.rpc('gen_random_uuid') helyett JS-ben generáljuk, hogy ne kelljen RPC
  const shareToken = crypto.randomUUID()

  const { error } = await supabase
    .from('work_preference_documents')
    .update({ is_shared: true, share_token: shareToken })
    .eq('id', id)
    .eq('user_id', userId)   // ownership check
  if (error) throw new Error(`sharePreferenceDocument: ${error.message}`)
  return { shareToken }
}

/** User visszavonja a megosztást. */
export async function unsharePreferenceDocument(
  id: string,
  userId: string,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('work_preference_documents')
    .update({ is_shared: false, share_token: null })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(`unsharePreferenceDocument: ${error.message}`)
}

/** Törlés (user saját dokumentuma). */
export async function deletePreferenceDocument(
  id: string,
  userId: string,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('work_preference_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)   // ownership check
  if (error) throw new Error(`deletePreferenceDocument: ${error.message}`)
}
