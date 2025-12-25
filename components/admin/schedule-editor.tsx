'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Clock, Plus, Trash2, Loader2 } from 'lucide-react';
import { useEmployeeSchedules, useCreateSchedule, useDeleteSchedule } from '@/hooks/use-schedules';
import { formatTime12h, formatTime24h } from '@/lib/format-time';
import { DAYS_OF_WEEK, DAYS_OF_WEEK_SHORT } from '@/types';

type ScheduleEditorProps = {
  userId: string;
  userName: string;
};

export function ScheduleEditor({ userId, userName }: ScheduleEditorProps) {
  const t = useTranslations();
  const { data: schedules, isLoading } = useEmployeeSchedules(userId);
  const createSchedule = useCreateSchedule();
  const deleteSchedule = useDeleteSchedule();

  // Form state for new schedule
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Monday by default
  const [newStartTime, setNewStartTime] = useState('');
  const [newStartAmPm, setNewStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [newEndTime, setNewEndTime] = useState('');
  const [newEndAmPm, setNewEndAmPm] = useState<'AM' | 'PM'>('PM');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const toggleDay = (dayIndex: number) => {
    setSelectedDays(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const handleAddSchedule = async () => {
    if (!newStartTime || !newEndTime || selectedDays.length === 0) return;

    const startTime24 = formatTime24h(`${newStartTime} ${newStartAmPm}`);
    const endTime24 = formatTime24h(`${newEndTime} ${newEndAmPm}`);

    // Create schedule for each selected day
    for (const dayOfWeek of selectedDays) {
      await createSchedule.mutateAsync({
        userId,
        dayOfWeek,
        startTime: startTime24,
        endTime: endTime24,
      });
    }

    // Reset form
    setNewStartTime('');
    setNewEndTime('');
    setSelectedDays([1]); // Reset to Monday
  };

  const handleDeleteSchedule = async () => {
    if (!deleteId) return;
    await deleteSchedule.mutateAsync({ id: deleteId, userId });
    setDeleteId(null);
  };

  // Group schedules by day
  const schedulesByDay = (schedules || []).reduce((acc, schedule) => {
    const day = schedule.dayOfWeek;
    if (!acc[day]) acc[day] = [];
    acc[day].push(schedule);
    return acc;
  }, {} as Record<number, typeof schedules>);

  const formatTimeInput = (value: string, setter: (v: string) => void) => {
    let val = value.replace(/[^\d:]/g, '');
    if (val.length === 2 && !val.includes(':')) {
      val = val + ':';
    }
    if (val.length <= 5) setter(val);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('employees.workSchedule')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing schedules grouped by day */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : schedules && schedules.length > 0 ? (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
              const daySchedules = schedulesByDay[dayIndex];
              if (!daySchedules || daySchedules.length === 0) return null;

              return (
                <div key={dayIndex} className="flex items-start gap-4">
                  <div className="w-24 font-medium text-sm pt-2">
                    {DAYS_OF_WEEK[dayIndex]}
                  </div>
                  <div className="flex-1 space-y-2">
                    {daySchedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between bg-accent/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm">
                          {formatTime12h(schedule.startTime)} - {formatTime12h(schedule.endTime)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(schedule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('employees.noSchedule')}
          </p>
        )}

        {/* Add new schedule */}
        <div className="border-t pt-4">
          <Label className="text-sm font-medium mb-3 block">{t('employees.addShift')}</Label>

          {/* Day selector - multi-select buttons */}
          <div className="flex flex-wrap gap-1 mb-3">
            {DAYS_OF_WEEK_SHORT.map((day, index) => (
              <button
                key={index}
                type="button"
                onClick={() => toggleDay(index)}
                className={`w-10 h-10 rounded-full text-xs font-semibold transition-colors ${
                  selectedDays.includes(index)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            {/* Start time */}
            <div className="flex items-center gap-1">
              <Input
                type="text"
                inputMode="numeric"
                value={newStartTime}
                onChange={(e) => formatTimeInput(e.target.value, setNewStartTime)}
                placeholder="9:00"
                className="w-20"
              />
              <div className="flex rounded-lg border-2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNewStartAmPm('AM')}
                  className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                    newStartAmPm === 'AM'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setNewStartAmPm('PM')}
                  className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                    newStartAmPm === 'PM'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  PM
                </button>
              </div>
            </div>

            <span className="text-muted-foreground">to</span>

            {/* End time */}
            <div className="flex items-center gap-1">
              <Input
                type="text"
                inputMode="numeric"
                value={newEndTime}
                onChange={(e) => formatTimeInput(e.target.value, setNewEndTime)}
                placeholder="5:00"
                className="w-20"
              />
              <div className="flex rounded-lg border-2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNewEndAmPm('AM')}
                  className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                    newEndAmPm === 'AM'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setNewEndAmPm('PM')}
                  className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                    newEndAmPm === 'PM'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  PM
                </button>
              </div>
            </div>

            <Button
              onClick={handleAddSchedule}
              disabled={!newStartTime || !newEndTime || selectedDays.length === 0 || createSchedule.isPending}
              size="sm"
            >
              {createSchedule.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-1">{t('common.add')}</span>
            </Button>
          </div>
        </div>

        {/* Delete confirmation dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('employees.deleteShift')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('employees.deleteShiftConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteSchedule}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteSchedule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
