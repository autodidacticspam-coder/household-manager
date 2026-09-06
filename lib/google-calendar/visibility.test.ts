import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/api-helpers', () => ({ getApiAdminClient: () => ({ rpc: mocks.rpc }) }));
import { canExportCalendarSource, loadCalendarVisibility, type CalendarVisibility } from './visibility';

describe('calendar export permissions', () => {
  const id='00000000-0000-4000-8000-000000000001';
  const visibility: CalendarVisibility={ tasks:new Set([id]),leave:new Set(),profiles:new Set([id]),schedules:new Set([id]),oneOffs:new Set([id]),childLogs:new Set() };
  it('checks the source record of dated schedule and profile events', () => {
    expect(canExportCalendarSource(visibility,'schedule',id+'-2026-09-06')).toBe(true);
    expect(canExportCalendarSource(visibility,'schedule','one-off-'+id)).toBe(true);
    expect(canExportCalendarSource(visibility,'important_date',id+'-Birthday')).toBe(true);
    expect(canExportCalendarSource(visibility,'schedule','one-off-unrelated')).toBe(false);
  });
  it('does not infer access to private leave or logs from task access', () => {
    expect(canExportCalendarSource(visibility,'task',id)).toBe(true);
    expect(canExportCalendarSource(visibility,'child_log',id)).toBe(false);
    expect(canExportCalendarSource(visibility,'leave',id)).toBe(false);
  });
  it('does not turn a failed or malformed permission query into an empty successful sync', async () => {
    mocks.rpc.mockResolvedValueOnce({ data:null,error:{message:'offline'} }).mockResolvedValueOnce({data:{tasks:[]},error:null});
    await expect(loadCalendarVisibility('user')).rejects.toThrow('permissions');
    await expect(loadCalendarVisibility('user')).rejects.toThrow('Invalid');
  });
});
