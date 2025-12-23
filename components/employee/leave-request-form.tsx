'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { format, isSameDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Loader2, X } from 'lucide-react';
import { useCreateLeaveRequest } from '@/hooks/use-leave';
import { createLeaveRequestSchema, type CreateLeaveRequestInput } from '@/lib/validators/leave';

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
            {t('common.submit')} {selectedDates.length > 0 && `(${selectedDates.length} days)`}
          </Button>
        </div>
      </form>
    </Form>
  );
}
