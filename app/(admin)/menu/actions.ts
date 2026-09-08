'use server';

import { createClient } from '@/lib/supabase/server';
import { databaseClient } from '@/lib/supabase/database-client';
import { updateFoodRequestNotesSchema } from '@/lib/validators/food-request-notes';
import { foodNoteResponseSchema } from '@/lib/validators/food-note-response';

type NotesError = 'invalidNotes' | 'notesNotAllowed' | 'notesChanged' | 'saveNotesFailed';
type NotesResult = { success: true } | { error: NotesError };

type ResponseError = 'invalidResponse' | 'responseNotAllowed' | 'noteChanged' | 'responseChanged' | 'saveResponseFailed';
type ResponseResult = { success: true } | { error: ResponseError };

export async function respondToFoodNote(input: unknown): Promise<ResponseResult> {
  const parsed = foodNoteResponseSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidResponse' };

  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'responseNotAllowed' };

    // The RPC checks Chef membership and locks the note before checking its revision.
    const { source, id, noteRevision, reply } = parsed.data;
    const { error } = await db.rpc('respond_to_food_note', {
      p_source: source,
      p_id: id,
      p_note_revision: noteRevision,
      ...(reply !== null ? { p_reply: reply } : {}),
    });
    if (error) {
      if (error.code === '42501') return { error: 'responseNotAllowed' };
      if (error.message === 'noteChanged') return { error: 'noteChanged' };
      if (error.message === 'responseChanged') return { error: 'responseChanged' };
      return { error: 'saveResponseFailed' };
    }
    return { success: true };
  } catch {
    return { error: 'saveResponseFailed' };
  }
}

export async function updateFoodRequestNotes(input: unknown): Promise<NotesResult> {
  const parsed = updateFoodRequestNotesSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidNotes' };

  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'notesNotAllowed' };

    const { data: profile, error: profileError } = await db.from('users').select('role').eq('id', user.id).single();
    if (profileError || profile?.role !== 'admin') return { error: 'notesNotAllowed' };

    // RLS permits administrators to update pending requests or their own history.
    // Compare the loaded version so an edit cannot silently replace a newer change.
    const { data, error } = await db.from('food_requests')
      .update({ notes: parsed.data.notes || null })
      .eq('id', parsed.data.id)
      .eq('updated_at', parsed.data.updatedAt)
      .select('id')
      .maybeSingle();

    if (error) return { error: 'saveNotesFailed' };
    if (!data) return { error: 'notesChanged' };
    return { success: true };
  } catch {
    return { error: 'saveNotesFailed' };
  }
}
