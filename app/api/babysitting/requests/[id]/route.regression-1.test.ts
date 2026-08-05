import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApiAuthUser: vi.fn(),
  getApiAdminClient: vi.fn(),
  syncOneOffScheduleChange: vi.fn(),
  sendBookingCancellationPush: vi.fn(),
  sendBookingResponsePush: vi.fn(),
}));

vi.mock('@/lib/supabase/api-helpers', () => ({
  getApiAuthUser: mocks.getApiAuthUser,
  getApiAdminClient: mocks.getApiAdminClient,
  handleApiError: (error: unknown) => ({
    error: error instanceof Error ? error.message : 'Unknown error',
    status: 500,
  }),
}));

vi.mock('@/lib/google-calendar/sync-service', () => ({
  syncOneOffScheduleChange: mocks.syncOneOffScheduleChange,
}));

vi.mock('@/lib/notifications/push-service', () => ({
  sendBookingCancellationPush: mocks.sendBookingCancellationPush,
  sendBookingResponsePush: mocks.sendBookingResponsePush,
}));

import { PATCH } from '@/app/api/babysitting/requests/[id]/route';

// Regression: ISSUE-002 — concurrent responses could create duplicate shifts
// Found by /qa on 2026-08-05
// Report: .gstack/qa-reports/qa-report-household-manager-two-vercel-app-2026-08-05.md
describe('booking request response concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes an unlinked shift when another response wins the race', async () => {
    const bookingRequest = {
      id: 'request-1',
      babysitter_id: 'sitter-1',
      request_date: '2026-08-13',
      start_time: '10:00:00',
      end_time: '14:00:00',
      created_by: 'admin-1',
      status: 'pending',
    };

    const fetchRequest = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: bookingRequest, error: null }),
    };
    const fetchUser = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'employee', full_name: 'Joyce' }, error: null }),
    };
    const insertShift = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'orphan-shift' }, error: null }),
    };
    const loseConditionalUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const cleanupResult = Promise.resolve({ error: null });
    const cleanupShift = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue(cleanupResult),
    };

    let bookingCalls = 0;
    let scheduleCalls = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'babysitter_booking_requests') {
          bookingCalls += 1;
          return bookingCalls === 1 ? fetchRequest : loseConditionalUpdate;
        }
        if (table === 'users') return fetchUser;
        if (table === 'schedule_one_offs') {
          scheduleCalls += 1;
          return scheduleCalls === 1 ? insertShift : cleanupShift;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.getApiAuthUser.mockResolvedValue({ id: 'sitter-1' });
    mocks.getApiAdminClient.mockReturnValue(supabase);

    const response = await PATCH(
      new Request('http://localhost/api/babysitting/requests/request-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: 'request-1' }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'This request has already been handled' });
    expect(loseConditionalUpdate.eq).toHaveBeenCalledWith('status', 'pending');
    expect(cleanupShift.delete).toHaveBeenCalledOnce();
    expect(cleanupShift.eq).toHaveBeenCalledWith('id', 'orphan-shift');
    expect(mocks.syncOneOffScheduleChange).not.toHaveBeenCalled();
    expect(mocks.sendBookingResponsePush).not.toHaveBeenCalled();
  });
});
