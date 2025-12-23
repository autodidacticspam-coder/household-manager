'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCalendarEvents } from '@/hooks/use-calendar';
import { useCompleteTask } from '@/hooks/use-tasks';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, CheckSquare, Clock, Settings, CheckCircle, Loader2 } from 'lucide-react';

type CalendarViewProps = {
  userId?: string;
  isEmployee?: boolean;
};

type ViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

export function CalendarView({ userId, isEmployee = false }: CalendarViewProps) {
  const t = useTranslations();
  const calendarRef = useRef<FullCalendar>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<ViewType>('timeGridWeek');
  const [showTasks, setShowTasks] = useState(true);
  const [showLeave, setShowLeave] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    type: 'task' | 'leave';
    start: Date;
    end: Date;
    extendedProps: Record<string, unknown>;
  } | null>(null);

  const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');

  const { data: events, isLoading, refetch } = useCalendarEvents({
    startDate,
    endDate,
    showTasks,
    showLeave,
    userId: isEmployee ? userId : undefined,
  });

  const completeTask = useCompleteTask();

  const handleCompleteTask = async (eventId: string) => {
    // Extract the actual task ID from the event ID
    // Format: task-{uuid} or task-{uuid}-{date} for recurring tasks
    const withoutPrefix = eventId.replace('task-', '');
    // UUID is 36 characters (including dashes)
    const actualTaskId = withoutPrefix.slice(0, 36);
    await completeTask.mutateAsync(actualTaskId);
    setSelectedEvent(null);
    refetch();
  };

  const handlePrev = () => {
    const newDate = subMonths(currentDate, 1);
    setCurrentDate(newDate);
    calendarRef.current?.getApi().prev();
  };

  const handleNext = () => {
    const newDate = addMonths(currentDate, 1);
    setCurrentDate(newDate);
    calendarRef.current?.getApi().next();
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    calendarRef.current?.getApi().today();
  };

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    calendarRef.current?.getApi().changeView(view);
  };

  const handleEventClick = (info: { event: {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    extendedProps: Record<string, unknown>;
  } }) => {
    const eventType = info.event.id.startsWith('task-') ? 'task' : 'leave';
    setSelectedEvent({
      id: info.event.id,
      title: info.event.title,
      type: eventType,
      start: info.event.start || new Date(),
      end: info.event.end || new Date(),
      extendedProps: info.event.extendedProps,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleToday}>
            {t('common.today')}
          </Button>
          <h2 className="text-lg font-semibold ml-2">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={currentView === 'timeGridDay' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => handleViewChange('timeGridDay')}
            >
              {t('calendar.day')}
            </Button>
            <Button
              variant={currentView === 'timeGridWeek' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-x"
              onClick={() => handleViewChange('timeGridWeek')}
            >
              {t('calendar.week')}
            </Button>
            <Button
              variant={currentView === 'dayGridMonth' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => handleViewChange('dayGridMonth')}
            >
              {t('calendar.month')}
            </Button>
          </div>

          <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {t('common.filter')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-tasks"
                  checked={showTasks}
                  onCheckedChange={(checked) => setShowTasks(!!checked)}
                />
                <Label htmlFor="show-tasks" className="flex items-center">
                  <CheckSquare className="h-4 w-4 mr-2 text-indigo-500" />
                  {t('calendar.showTasks')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-leave"
                  checked={showLeave}
                  onCheckedChange={(checked) => setShowLeave(!!checked)}
                />
                <Label htmlFor="show-leave" className="flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-blue-500" />
                  {t('calendar.showLeave')}
                </Label>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 sm:p-4">
          <div className={`calendar-wrapper ${isLoading ? 'opacity-50' : ''}`}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={currentView}
              headerToolbar={false}
              events={events?.map((e) => ({
                id: e.id,
                title: e.title,
                start: e.start,
                end: e.end,
                allDay: e.allDay,
                backgroundColor: e.color,
                borderColor: e.color,
                extendedProps: e.extendedProps,
              })) || []}
              eventClick={handleEventClick}
              height="auto"
              dayMaxEvents={3}
              eventDisplay="block"
              eventTimeFormat={{
                hour: 'numeric',
                minute: '2-digit',
                meridiem: 'short',
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Event Detail Popover */}
      {selectedEvent && (
        <Card className="fixed bottom-4 right-4 w-80 shadow-lg z-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {selectedEvent.type === 'task' ? (
                  <span className="flex items-center">
                    <CheckSquare className="h-4 w-4 mr-2 text-indigo-500" />
                    {t('nav.tasks')}
                  </span>
                ) : (
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-blue-500" />
                    {t('nav.timeOff')}
                  </span>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="font-semibold">{selectedEvent.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {format(selectedEvent.start, 'MMM d, yyyy')}
              {selectedEvent.start.toDateString() !== selectedEvent.end.toDateString() && (
                <> - {format(selectedEvent.end, 'MMM d, yyyy')}</>
              )}
            </p>

            {selectedEvent.type === 'task' && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {!!selectedEvent.extendedProps.status && (
                    <Badge variant="secondary">
                      {String(selectedEvent.extendedProps.status)}
                    </Badge>
                  )}
                  {!!selectedEvent.extendedProps.priority && (
                    <Badge variant="outline">
                      {String(selectedEvent.extendedProps.priority)}
                    </Badge>
                  )}
                  {!!selectedEvent.extendedProps.category && (
                    <Badge variant="outline">
                      {String(selectedEvent.extendedProps.category)}
                    </Badge>
                  )}
                  {!!selectedEvent.extendedProps.isRecurring && (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      {t('tasks.recurring')}
                    </Badge>
                  )}
                </div>
                {Array.isArray(selectedEvent.extendedProps.assignees) && selectedEvent.extendedProps.assignees.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('tasks.assignedTo')}:</p>
                    <div className="flex flex-wrap gap-1">
                      {(selectedEvent.extendedProps.assignees as string[]).map((name, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mark Complete Button */}
                {String(selectedEvent.extendedProps.status) !== 'completed' && (
                  <Button
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => handleCompleteTask(selectedEvent.id)}
                    disabled={completeTask.isPending}
                  >
                    {completeTask.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    {t('tasks.markComplete')}
                  </Button>
                )}
              </div>
            )}

            {selectedEvent.type === 'leave' && (
              <div className="mt-3">
                <Badge variant="secondary">
                  {String(selectedEvent.extendedProps.leaveType) === 'pto' ? t('leave.pto') : t('leave.sick')}
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  {String(selectedEvent.extendedProps.totalDays)} {t('common.days')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <style jsx global>{`
        .calendar-wrapper .fc {
          font-family: inherit;
        }
        .calendar-wrapper .fc-daygrid-day-number {
          padding: 8px;
        }
        .calendar-wrapper .fc-event {
          cursor: pointer;
          font-size: 0.75rem;
          padding: 2px 4px;
          border-radius: 4px;
        }
        .calendar-wrapper .fc-daygrid-event-dot {
          display: none;
        }
        .calendar-wrapper .fc-toolbar-title {
          font-size: 1.25rem;
        }
        .calendar-wrapper .fc-button {
          background-color: transparent;
          border-color: #e5e7eb;
          color: #374151;
        }
        .calendar-wrapper .fc-button:hover {
          background-color: #f3f4f6;
        }
        .calendar-wrapper .fc-button-primary:not(:disabled).fc-button-active {
          background-color: #4f46e5;
          border-color: #4f46e5;
        }
        .calendar-wrapper .fc-day-today {
          background-color: #eff6ff !important;
        }
      `}</style>
    </div>
  );
}
