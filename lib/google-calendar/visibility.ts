import { getApiAdminClient } from '@/lib/supabase/api-helpers';

type VisibilityField = 'tasks' | 'leave' | 'profiles' | 'schedules' | 'oneOffs' | 'childLogs';
export type CalendarVisibility = Record<VisibilityField, Set<string>>;

export async function loadCalendarVisibility(userId: string): Promise<CalendarVisibility> {
  const { data, error } = await getApiAdminClient().rpc('calendar_visible_records', { p_user_id: userId });
  if (error || !data) throw new Error('Unable to verify calendar export permissions');
  const fields: VisibilityField[] = ['tasks', 'leave', 'profiles', 'schedules', 'oneOffs', 'childLogs'];
  const visibility = {} as CalendarVisibility;
  for (const field of fields) {
    if (!Array.isArray(data[field]) || data[field].some((id: unknown) => typeof id !== 'string')) {
      throw new Error('Invalid calendar permission response');
    }
    visibility[field] = new Set(data[field]);
  }
  return visibility;
}

export function canExportCalendarSource(visibility: CalendarVisibility, eventType: string, sourceId: string): boolean {
  switch (eventType) {
    case 'task': return visibility.tasks.has(sourceId);
    case 'leave': return visibility.leave.has(sourceId);
    case 'child_log': return visibility.childLogs.has(sourceId);
    case 'important_date': return visibility.profiles.has(sourceId.slice(0, 36));
    case 'schedule': return sourceId.startsWith('one-off-')
      ? visibility.oneOffs.has(sourceId.slice(8))
      : visibility.schedules.has(sourceId.slice(0, 36));
    default: return false;
  }
}
