'use server';

import { createClient } from '@/lib/supabase/server';
import { databaseClient } from '@/lib/supabase/database-client';
import { updateFoodRequestNotesSchema } from '@/lib/validators/food-request-notes';
import { foodNoteResponseSchema } from '@/lib/validators/food-note-response';
import { menuSwapSchema } from '@/lib/validators/menu-swap';
import { menuRequestSchema, menuResponseSchema, saveMenuSchema } from '@/lib/validators/menu-requests';
import { scheduleMenuPushes } from '@/lib/notifications/menu-push';

type NotesError = 'invalidNotes' | 'notesNotAllowed' | 'notesChanged' | 'saveNotesFailed';
type NotesResult = { success: true } | { error: NotesError };

type ResponseError = 'invalidResponse' | 'responseNotAllowed' | 'noteChanged' | 'responseChanged' | 'saveResponseFailed';
type ResponseResult = { success: true } | { error: ResponseError };

type SwapError = 'invalidSwap' | 'swapNotAllowed' | 'menuChanged' | 'swapFailed';
type SwapResult = { success: true; updatedAt: string | null } | { error: SwapError };

type MenuError = 'invalidRequest' | 'requestNotAllowed' | 'responseNotAllowed' | 'menuChanged'
  | 'alreadyRequested' | 'alreadyResponded' | 'noChef' | 'requestFailed' | 'saveNotAllowed' | 'invalidMenu' | 'saveFailed';
const menuErrors = new Set<MenuError>(['invalidRequest', 'requestNotAllowed', 'responseNotAllowed', 'menuChanged',
  'alreadyRequested', 'alreadyResponded', 'noChef', 'saveNotAllowed', 'invalidMenu']);

function menuError(error: { message: string }, fallback: MenuError): { error: MenuError } {
  return { error: menuErrors.has(error.message as MenuError) ? error.message as MenuError : fallback };
}

export async function saveWeeklyMenu(input: unknown): Promise<{ success: true } | { error: MenuError }> {
  const parsed = saveMenuSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidMenu' };
  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'saveNotAllowed' };
    const value = parsed.data;
    const { error } = await db.rpc('save_weekly_menu', {
      p_week_start: value.weekStart, p_meals: value.meals, p_notes: value.notes || '',
      ...(value.expectedUpdatedAt ? { p_expected_updated_at: value.expectedUpdatedAt } : {}),
    });
    if (error) return menuError(error, 'saveFailed');
    scheduleMenuPushes(user.id);
    return { success: true };
  } catch { return { error: 'saveFailed' }; }
}

export async function requestMenuSwap(input: unknown): Promise<{ success: true } | { error: MenuError }> {
  const parsed = menuRequestSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidRequest' };
  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'requestNotAllowed' };
    const value = parsed.data;
    const { error } = await db.rpc('request_menu_swap', {
      p_week_start: value.weekStart, p_day_a: value.from.day, p_meal_a: value.from.mealType,
      p_day_b: value.to.day, p_meal_b: value.to.mealType, p_expected_updated_at: value.expectedUpdatedAt, p_note: value.note,
    });
    if (error) return menuError(error, 'requestFailed');
    scheduleMenuPushes(user.id);
    return { success: true };
  } catch { return { error: 'requestFailed' }; }
}

export async function respondToMenuSwap(input: unknown): Promise<{ success: true; status: string } | { error: MenuError }> {
  const parsed = menuResponseSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidRequest' };
  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'responseNotAllowed' };
    const { error, data } = await db.rpc('respond_to_menu_swap', {
      p_id: parsed.data.id, p_decision: parsed.data.decision, p_reply: parsed.data.reply,
    });
    if (error) return menuError(error, 'requestFailed');
    scheduleMenuPushes(user.id);
    return { success: true, status: data };
  } catch { return { error: 'requestFailed' }; }
}

export async function markMenuNotificationRead(id: string): Promise<{ success: true } | { error: MenuError }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'invalidRequest' };
  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'requestNotAllowed' };
    const { error } = await db.from('menu_notifications').update({ read_at: new Date().toISOString() })
      .eq('id', id).eq('recipient_id', user.id).is('read_at', null);
    return error ? { error: 'requestFailed' } : { success: true };
  } catch { return { error: 'requestFailed' }; }
}

export async function swapMenuMeals(input: unknown): Promise<SwapResult> {
  const parsed = menuSwapSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidSwap' };

  try {
    const db = databaseClient(await createClient());
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return { error: 'swapNotAllowed' };

    // The RPC checks administrator or Chef membership, locks the week, and moves ratings with the dishes.
    const { weekStart, from, to, expectedUpdatedAt } = parsed.data;
    const { data, error } = await db.rpc('swap_menu_meals', {
      p_week_start: weekStart,
      p_day_a: from.day,
      p_meal_a: from.mealType,
      p_day_b: to.day,
      p_meal_b: to.mealType,
      ...(expectedUpdatedAt ? { p_expected_updated_at: expectedUpdatedAt } : {}),
    });
    if (error) {
      if (error.code === '42501') return { error: 'swapNotAllowed' };
      if (error.message === 'menuChanged') return { error: 'menuChanged' };
      if (error.message === 'invalidSwap') return { error: 'invalidSwap' };
      return { error: 'swapFailed' };
    }
    scheduleMenuPushes(user.id);
    return { success: true, updatedAt: typeof data === 'string' ? data : null };
  } catch {
    return { error: 'swapFailed' };
  }
}

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
