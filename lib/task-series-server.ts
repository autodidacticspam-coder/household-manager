import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import { chunkForInFilter } from '@/lib/supabase/pagination';
import { filterSyncedSourceIds, syncEventToConnectedUsers } from '@/lib/google-calendar/sync-service';

export async function syncTaskSeriesChanges(changes: { managedIds: string[]; createdIds: string[]; deletedIds: string[] }) {
  try {
    for (const id of await filterSyncedSourceIds('task', changes.deletedIds)) {
      await syncEventToConnectedUsers('task', id, 'delete');
    }
    const created = new Set(changes.createdIds);
    for (const ids of chunkForInFilter(changes.managedIds)) {
      const { data, error } = await getApiAdminClient().from('tasks')
        .select('id,title,description,due_date,due_time,is_all_day,is_activity,start_time,end_time,status,priority').in('id', ids);
      if (error) throw error;
      for (const task of data || []) {
        await syncEventToConnectedUsers('task', task.id, created.has(task.id) ? 'create' : 'update', {
          id: task.id, title: task.title, description: task.description, dueDate: task.due_date,
          dueTime: task.due_time, isAllDay: task.is_all_day, isActivity: task.is_activity,
          startTime: task.start_time, endTime: task.end_time, status: task.status, priority: task.priority,
        });
      }
    }
  } catch (err) { console.error('Series calendar sync failed:', err); }
}
