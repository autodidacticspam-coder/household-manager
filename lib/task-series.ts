import { generateTaskDates, type RepeatInterval } from '@/lib/task-generator';

/** Names and timestamps are presentation/history, never a task's identity. */
export function taskSeriesKey(task: { id: string; series_id?: string | null }): string {
  return task.series_id ? `series:${task.series_id}` : `task:${task.id}`;
}

export function futureSeriesDates(input: {
  repeatDays: number[];
  repeatInterval: RepeatInterval;
  startDate: string;
  endDate: string;
  afterDate: string;
}): string[] {
  const maximum = new Date(`${input.afterDate}T12:00:00Z`);
  maximum.setUTCFullYear(maximum.getUTCFullYear() + 2);
  if (!Number.isFinite(maximum.getTime()) || input.endDate > maximum.toISOString().slice(0, 10)) {
    throw new Error('Repeat end date can be at most 2 years after the start date');
  }
  return generateTaskDates({
    selectedDays: input.repeatDays,
    repeatInterval: input.repeatInterval,
    startDate: input.startDate,
    endDate: input.endDate,
  }).filter((date) => date > input.afterDate);
}
