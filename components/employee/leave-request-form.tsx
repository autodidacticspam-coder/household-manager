'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { format, isSameDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Clock } from 'lucide-react';
import { useCreateLeaveRequest } from '@/hooks/use-leave';
import { createLeaveRequestSchema, type CreateLeaveRequestInput } from '@/lib/validators/leave';

// Generate time options from 6 AM to 8 PM in 30-minute increments
const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const totalMinutes = (6 * 60) + (i * 30); // Start at 6 AM
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  const timeLabel = `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  return { value: time24, label: timeLabel };
});

type LeaveRequestFormProps = {
  onSuccess?: () => void;
};

export function LeaveRequestForm({ onSuccess }: LeaveRequestFormProps) {
  const t = useTranslations();
  const router = useRouter();

  const [selectedDates, setSelectedDates] = useState<Date[]>([]);

  const createRequest = useCreateLeaveRequest();

  const form = useForm<CreateLeaveRequestInput>({
    resolver: zodResolver(createLeaveRequestSchema),
    defaultValues: {
      leaveType: 'pto',
      startDate: '',
      endDate: '',
      isFullDay: true,
      startTime: null,
      endTime: null,
      reason: '',
    },
  });

  const isFullDay = form.watch('isFullDay');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');

  // Only allow partial day when exactly 1 day is selected
  const canSelectPartialDay = selectedDates.length === 1;

  // Reset to full day when selecting multiple days
  useEffect(() => {
    if (selectedDates.length > 1 && !isFullDay) {
      form.setValue('isFullDay', true);
      form.setValue('startTime', null);
      form.setValue('endTime', null);
    }
  }, [selectedDates.length, isFullDay, form]);

  // Calculate hours for display
  const calculateHours = () => {
    if (isFullDay || !startTime || !endTime) return null;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const diffMinutes = endMinutes - startMinutes;
    if (diffMinutes <= 0) return null;
    const hours = diffMinutes / 60;
    return hours;
  };

  const hoursOff = calculateHours();

  // Update form values when dates change
  const handleDateSelect = (dates: Date[] | undefined) => {
    const sortedDates = (dates || []).sort((a, b) => a.getTime() - b.getTime());
    setSelectedDates(sortedDates);

    if (sortedDates.length > 0) {
      form.setValue('startDate', format(sortedDates[0], 'yyyy-MM-dd'));
      form.setValue('endDate', format(sortedDates[sortedDates.length - 1], 'yyyy-MM-dd'));
      form.setValue('selectedDaysCount', sortedDates.length);
    } else {
      form.setValue('startDate', '');
      form.setValue('endDate', '');
      form.setValue('selectedDaysCount', undefined);
    }
  };

  const removeDate = (dateToRemove: Date) => {
    const newDates = selectedDates.filter(d => !isSameDay(d, dateToRemove));
    handleDateSelect(newDates);
  };

  const handleFullDayToggle = (checked: boolean) => {
    form.setValue('isFullDay', checked);
    if (checked) {
      form.setValue('startTime', null);
      form.setValue('endTime', null);
    } else {
      // Set default times: 9 AM to 1 PM (half day)
      form.setValue('startTime', '09:00');
      form.setValue('endTime', '13:00');
    }
  };

  const onSubmit = async (data: CreateLeaveRequestInput) => {
    if (selectedDates.length === 0) {
      form.setError('startDate', { message: 'Please select at least one day' });
      return;
    }

    await createRequest.mutateAsync(data);
    onSuccess?.();
    router.push('/time-off');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('common.details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="leaveType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('leave.leaveType')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pto">{t('leave.pto')}</SelectItem>
                      <SelectItem value="sick">{t('leave.sick')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startDate"
              render={() => (
                <FormItem>
                  <FormLabel>Select Days Off</FormLabel>
                  <p className="text-sm text-muted-foreground mb-3">
                    Click on the calendar to select the days you want off. Click again to deselect.
                  </p>

                  {/* Selected dates display */}
                  {selectedDates.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          Selected: {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDateSelect([])}
                          className="h-6 px-2 text-xs"
                        >
                          Clear all
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedDates.map((date) => (
                          <Badge
                            key={date.toISOString()}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {format(date, 'EEE, MMM d')}
                            <button
                              type="button"
                              onClick={() => removeDate(date)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center border rounded-lg p-4">
                    <Calendar
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      numberOfMonths={2}
                      className="rounded-md"
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Partial Day Toggle - Only available for single day selection */}
            {canSelectPartialDay && (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="full-day-toggle" className="text-base font-medium">
                      Full Day
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {isFullDay
                        ? 'Taking the entire day off'
                        : 'Taking partial day off - select your hours'}
                    </p>
                  </div>
                  <Switch
                    id="full-day-toggle"
                    checked={isFullDay ?? true}
                    onCheckedChange={handleFullDayToggle}
                  />
                </div>

                {/* Time Selectors for Partial Day */}
                {!isFullDay && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <FormField
                      control={form.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Start Time
                          </FormLabel>
                          <Select
                            value={field.value || ''}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select start time" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TIME_OPTIONS.map((time) => (
                                <SelectItem key={time.value} value={time.value}>
                                  {time.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            End Time
                          </FormLabel>
                          <Select
                            value={field.value || ''}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select end time" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TIME_OPTIONS.filter(time => {
                                // Only show times after start time
                                if (!startTime) return true;
                                return time.value > startTime;
                              }).map((time) => (
                                <SelectItem key={time.value} value={time.value}>
                                  {time.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {hoursOff && (
                      <div className="col-span-2 text-center">
                        <Badge variant="secondary" className="text-sm">
                          {hoursOff} hour{hoursOff !== 1 ? 's' : ''} off
                          ({(hoursOff / 8).toFixed(2)} day{(hoursOff / 8) !== 1 ? 's' : ''})
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedDates.length > 1 && (
              <p className="text-sm text-muted-foreground">
                <Clock className="h-4 w-4 inline mr-1" />
                Partial day requests are only available when selecting a single day.
              </p>
            )}

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('leave.reason')} (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      placeholder="Reason for leave request..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/time-off')}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={createRequest.isPending || selectedDates.length === 0}>
            {createRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.submit')} {selectedDates.length > 0 && (
              isFullDay
                ? `(${selectedDates.length} day${selectedDates.length !== 1 ? 's' : ''})`
                : hoursOff
                  ? `(${hoursOff} hour${hoursOff !== 1 ? 's' : ''})`
                  : ''
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
