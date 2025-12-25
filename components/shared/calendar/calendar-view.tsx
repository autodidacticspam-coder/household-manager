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
import { useUpsertScheduleOverride, useDeleteScheduleOverride } from '@/hooks/use-schedules';
import { Input } from '@/components/ui/input';
import { formatTime12h, formatTime24h } from '@/lib/format-time';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, CheckSquare, Clock, Settings, CheckCircle, Loader2, Moon, Utensils, Baby, ShowerHead, Gift, Briefcase } from 'lucide-react';

type CalendarViewProps = {
  userId?: string;
  isEmployee?: boolean;
};

type ViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridTwoDay' | 'timeGridDay';

// Get initial view based on screen width
function getInitialView(): ViewType {
  if (typeof window !== 'undefined') {
    return window.innerWidth < 768 ? 'timeGridTwoDay' : 'timeGridWeek';
  }
  return 'timeGridWeek';
}

// localStorage key for calendar filters
const CALENDAR_FILTERS_KEY = 'calendar-filters';

type CalendarFiltersState = {
  showTasks: boolean;
  showLeave: boolean;
  showSleep: boolean;
  showFood: boolean;
  showPoop: boolean;
  showShower: boolean;
  showImportantDates: boolean;
  showSchedules: boolean;
};

function loadFiltersFromStorage(): CalendarFiltersState {
  if (typeof window === 'undefined') {
    return {
      showTasks: true,
      showLeave: true,
      showSleep: true,
      showFood: true,
      showPoop: true,
      showShower: true,
      showImportantDates: true,
      showSchedules: true,
    };
  }
  try {
    const saved = localStorage.getItem(CALENDAR_FILTERS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return {
    showTasks: true,
    showLeave: true,
    showSleep: true,
    showFood: true,
    showPoop: true,
    showShower: true,
    showImportantDates: true,
    showSchedules: true,
  };
}

export function CalendarView({ userId, isEmployee = false }: CalendarViewProps) {
  const t = useTranslations();
  const calendarRef = useRef<FullCalendar>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<ViewType>(getInitialView);

  // Load initial filter state from localStorage
  const [filters, setFilters] = useState<CalendarFiltersState>(loadFiltersFromStorage);
  const { showTasks, showLeave, showSleep, showFood, showPoop, showShower, showImportantDates, showSchedules } = filters;

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(CALENDAR_FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  // Helper to update individual filter
  const updateFilter = (key: keyof CalendarFiltersState, value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    type: 'task' | 'leave' | 'log' | 'important_date' | 'schedule';
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
    showSleep,
    showFood,
    showPoop,
    showShower,
    showImportantDates: isEmployee ? false : showImportantDates,
    showSchedules: isEmployee ? false : showSchedules,
    userId: isEmployee ? userId : undefined,
  });

  const completeTask = useCompleteTask();
  const upsertOverride = useUpsertScheduleOverride();
  const deleteOverride = useDeleteScheduleOverride();

  // Schedule editing state
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editStartAmPm, setEditStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [editEndTime, setEditEndTime] = useState('');
  const [editEndAmPm, setEditEndAmPm] = useState<'AM' | 'PM'>('PM');

  // Helper to parse time and set edit state
  const initScheduleEdit = (startTime: string, endTime: string) => {
    const start12 = formatTime12h(startTime);
    const end12 = formatTime12h(endTime);
    // Parse "9:00 AM" format
    const [startTimeStr, startPeriod] = start12.split(' ');
    const [endTimeStr, endPeriod] = end12.split(' ');
    setEditStartTime(startTimeStr);
    setEditStartAmPm(startPeriod as 'AM' | 'PM');
    setEditEndTime(endTimeStr);
    setEditEndAmPm(endPeriod as 'AM' | 'PM');
    setEditingSchedule(true);
  };

  // Set initial view based on screen size on mount and sync with calendar
  useEffect(() => {
    const handleResize = () => {
      const newView = window.innerWidth < 768 ? 'timeGridTwoDay' : 'timeGridWeek';
      if (newView !== currentView) {
        setCurrentView(newView);
        calendarRef.current?.getApi().changeView(newView);
      }
    };

    // Set initial view on mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentView]);

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
    let eventType: 'task' | 'leave' | 'log' | 'important_date' | 'schedule' = 'task';
    if (info.event.id.startsWith('leave-')) {
      eventType = 'leave';
    } else if (info.event.id.startsWith('log-')) {
      eventType = 'log';
    } else if (info.event.id.startsWith('important-')) {
      eventType = 'important_date';
    } else if (info.event.id.startsWith('schedule-')) {
      eventType = 'schedule';
    }
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
              variant={currentView === 'timeGridTwoDay' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-x"
              onClick={() => handleViewChange('timeGridTwoDay')}
            >
              2 {t('calendar.days')}
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
                  onCheckedChange={(checked) => updateFilter('showTasks', !!checked)}
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
                  onCheckedChange={(checked) => updateFilter('showLeave', !!checked)}
                />
                <Label htmlFor="show-leave" className="flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-blue-500" />
                  {t('calendar.showLeave')}
                </Label>
              </div>
              {!isEmployee && (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-important-dates"
                      checked={showImportantDates}
                      onCheckedChange={(checked) => updateFilter('showImportantDates', !!checked)}
                    />
                    <Label htmlFor="show-important-dates" className="flex items-center">
                      <Gift className="h-4 w-4 mr-2 text-pink-500" />
                      {t('calendar.showImportantDates')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-schedules"
                      checked={showSchedules}
                      onCheckedChange={(checked) => updateFilter('showSchedules', !!checked)}
                    />
                    <Label htmlFor="show-schedules" className="flex items-center">
                      <Briefcase className="h-4 w-4 mr-2 text-violet-500" />
                      {t('calendar.showSchedules')}
                    </Label>
                  </div>
                </>
              )}
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t('childLogs.title')}</p>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-sleep"
                      checked={showSleep}
                      onCheckedChange={(checked) => updateFilter('showSleep', !!checked)}
                    />
                    <Label htmlFor="show-sleep" className="flex items-center">
                      <Moon className="h-4 w-4 mr-2 text-indigo-500" />
                      {t('childLogs.categories.sleep')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-food"
                      checked={showFood}
                      onCheckedChange={(checked) => updateFilter('showFood', !!checked)}
                    />
                    <Label htmlFor="show-food" className="flex items-center">
                      <Utensils className="h-4 w-4 mr-2 text-orange-500" />
                      {t('childLogs.categories.food')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-poop"
                      checked={showPoop}
                      onCheckedChange={(checked) => updateFilter('showPoop', !!checked)}
                    />
                    <Label htmlFor="show-poop" className="flex items-center">
                      <Baby className="h-4 w-4 mr-2 text-amber-500" />
                      {t('childLogs.categories.poop')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-shower"
                      checked={showShower}
                      onCheckedChange={(checked) => updateFilter('showShower', !!checked)}
                    />
                    <Label htmlFor="show-shower" className="flex items-center">
                      <ShowerHead className="h-4 w-4 mr-2 text-cyan-500" />
                      {t('childLogs.categories.shower')}
                    </Label>
                  </div>
                </div>
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
              views={{
                timeGridTwoDay: {
                  type: 'timeGrid',
                  duration: { days: 2 },
                  buttonText: '2 days',
                },
              }}
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
                ) : selectedEvent.type === 'log' ? (
                  <span className="flex items-center">
                    <Baby className="h-4 w-4 mr-2 text-amber-500" />
                    {t('childLogs.title')}
                  </span>
                ) : selectedEvent.type === 'important_date' ? (
                  <span className="flex items-center">
                    <Gift className="h-4 w-4 mr-2 text-pink-500" />
                    {t('employees.importantDates')}
                  </span>
                ) : selectedEvent.type === 'schedule' ? (
                  <span className="flex items-center">
                    <Briefcase className="h-4 w-4 mr-2 text-violet-500" />
                    {t('employees.workSchedule')}
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
                <Badge
                  variant="secondary"
                  className={Boolean(selectedEvent.extendedProps.isHoliday) ? 'bg-amber-100 text-amber-700' : ''}
                >
                  {Boolean(selectedEvent.extendedProps.isHoliday)
                    ? t('leave.holiday')
                    : String(selectedEvent.extendedProps.leaveType) === 'pto'
                      ? t('leave.pto')
                      : t('leave.sick')}
                </Badge>
                {Boolean(selectedEvent.extendedProps.isHoliday) && selectedEvent.extendedProps.holidayName ? (
                  <p className="text-sm font-medium mt-2">
                    {String(selectedEvent.extendedProps.holidayName)}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground mt-2">
                  {String(selectedEvent.extendedProps.totalDays)} {t('common.days')}
                </p>
              </div>
            )}

            {selectedEvent.type === 'log' && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {String(selectedEvent.extendedProps.child)}
                  </Badge>
                  <Badge variant="outline">
                    {t(`childLogs.categories.${String(selectedEvent.extendedProps.logCategory)}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {format(selectedEvent.start, 'h:mm a')}
                </p>
                {Boolean(selectedEvent.extendedProps.description) && (
                  <p className="text-sm">{String(selectedEvent.extendedProps.description)}</p>
                )}
                {Boolean(selectedEvent.extendedProps.loggedBy) && (
                  <p className="text-xs text-muted-foreground">
                    {t('childLogs.loggedBy')}: {String(selectedEvent.extendedProps.loggedBy)}
                  </p>
                )}
              </div>
            )}

            {selectedEvent.type === 'important_date' && (
              <div className="mt-3 space-y-2">
                <Badge variant="secondary" className="bg-pink-100 text-pink-700">
                  {String(selectedEvent.extendedProps.label)}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {String(selectedEvent.extendedProps.employeeName)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Recurring annually
                </p>
              </div>
            )}

            {selectedEvent.type === 'schedule' && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={Boolean(selectedEvent.extendedProps.hasOverride) ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}>
                    {Boolean(selectedEvent.extendedProps.hasOverride) ? t('employees.modifiedSchedule') : t('employees.workSchedule')}
                  </Badge>
                </div>

                {!editingSchedule ? (
                  <>
                    <p className="text-sm">
                      {format(selectedEvent.start, 'h:mm a')} - {format(selectedEvent.end, 'h:mm a')}
                    </p>
                    {Boolean(selectedEvent.extendedProps.hasOverride) && (
                      <p className="text-xs text-muted-foreground">
                        {t('employees.originalSchedule')}: {formatTime12h(String(selectedEvent.extendedProps.originalStartTime))} - {formatTime12h(String(selectedEvent.extendedProps.originalEndTime))}
                      </p>
                    )}
                    {!isEmployee && (
                      <div className="flex flex-col gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => initScheduleEdit(
                            format(selectedEvent.start, 'HH:mm'),
                            format(selectedEvent.end, 'HH:mm')
                          )}
                        >
                          {t('employees.editScheduleInstance')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full"
                          disabled={upsertOverride.isPending}
                          onClick={async () => {
                            await upsertOverride.mutateAsync({
                              scheduleId: String(selectedEvent.extendedProps.scheduleId),
                              overrideDate: String(selectedEvent.extendedProps.scheduleDate),
                              isCancelled: true,
                            });
                            setSelectedEvent(null);
                            refetch();
                          }}
                        >
                          {upsertOverride.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {t('employees.cancelShiftForDay')}
                        </Button>
                        {Boolean(selectedEvent.extendedProps.hasOverride) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full"
                            disabled={deleteOverride.isPending}
                            onClick={async () => {
                              await deleteOverride.mutateAsync({
                                scheduleId: String(selectedEvent.extendedProps.scheduleId),
                                overrideDate: String(selectedEvent.extendedProps.scheduleDate),
                              });
                              setSelectedEvent(null);
                              refetch();
                            }}
                          >
                            {deleteOverride.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {t('employees.restoreOriginal')}
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editStartTime}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^\d:]/g, '');
                          if (val.length === 2 && !val.includes(':')) val = val + ':';
                          if (val.length <= 5) setEditStartTime(val);
                        }}
                        placeholder="9:00"
                        className="w-20"
                      />
                      <div className="flex rounded-lg border-2 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setEditStartAmPm('AM')}
                          className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                            editStartAmPm === 'AM'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          AM
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditStartAmPm('PM')}
                          className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                            editStartAmPm === 'PM'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          PM
                        </button>
                      </div>
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={editEndTime}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^\d:]/g, '');
                          if (val.length === 2 && !val.includes(':')) val = val + ':';
                          if (val.length <= 5) setEditEndTime(val);
                        }}
                        placeholder="5:00"
                        className="w-20"
                      />
                      <div className="flex rounded-lg border-2 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setEditEndAmPm('AM')}
                          className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                            editEndAmPm === 'AM'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          AM
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditEndAmPm('PM')}
                          className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                            editEndAmPm === 'PM'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          PM
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!editStartTime || !editEndTime || upsertOverride.isPending}
                        onClick={async () => {
                          const startTime24 = formatTime24h(`${editStartTime} ${editStartAmPm}`);
                          const endTime24 = formatTime24h(`${editEndTime} ${editEndAmPm}`);
                          await upsertOverride.mutateAsync({
                            scheduleId: String(selectedEvent.extendedProps.scheduleId),
                            overrideDate: String(selectedEvent.extendedProps.scheduleDate),
                            startTime: startTime24,
                            endTime: endTime24,
                          });
                          setEditingSchedule(false);
                          setSelectedEvent(null);
                          refetch();
                        }}
                      >
                        {upsertOverride.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t('common.save')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingSchedule(false)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
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
