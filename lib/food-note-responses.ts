import type { Database } from '@/types/database';

export type FoodNoteResponse = {
  id: string;
  respondedBy: string;
  chefName: string | null;
  reply: string | null;
  receivedAt: string;
  repliedAt: string | null;
};

type ResponseRow = Database['public']['Tables']['food_note_responses']['Row'] & {
  chef: { full_name: string } | null;
};

export function currentFoodNoteResponses(rows: ResponseRow[] | null | undefined, revision: string): FoodNoteResponse[] {
  return (rows || []).filter(row => row.note_revision === revision)
    .sort((a, b) => a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id))
    .map(row => ({
      id: row.id, respondedBy: row.responded_by, chefName: row.chef?.full_name || null,
      reply: row.reply, receivedAt: row.received_at, repliedAt: row.replied_at,
    }));
}
