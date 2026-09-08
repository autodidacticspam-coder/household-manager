import { describe, expect, it } from 'vitest';
import { currentFoodNoteResponses } from './food-note-responses';

describe('food note response data boundary', () => {
  it('shows only responses for the current note revision, in time order', () => {
    const base = { food_request_id: 'request', menu_rating_id: null, responded_by: 'chef', reply: null, replied_at: null, chef: { full_name: 'Sam' } };
    const rows = [
      { ...base, id: 'later', note_revision: 'current', received_at: '2026-09-08T18:00:00Z' },
      { ...base, id: 'old', note_revision: 'previous', received_at: '2026-09-08T16:00:00Z', reply: 'Old wording' },
      { ...base, id: 'first', note_revision: 'current', received_at: '2026-09-08T17:00:00Z', chef: null },
    ];
    expect(currentFoodNoteResponses(rows, 'current')).toEqual([
      { id: 'first', respondedBy: 'chef', chefName: null, reply: null, receivedAt: '2026-09-08T17:00:00Z', repliedAt: null },
      { id: 'later', respondedBy: 'chef', chefName: 'Sam', reply: null, receivedAt: '2026-09-08T18:00:00Z', repliedAt: null },
    ]);
  });
});
