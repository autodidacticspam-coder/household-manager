'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
import { useCalendarEvents } from '@/hooks/use-calendar';
import { useCompleteTask, useDeleteTask, useDeleteFutureTasks, useTaskBatchInfo, useUpdateTaskDateTime, useUpdateTaskStatus } from '@/hooks/use-tasks';
import { useUpsertScheduleOverride, useDeleteScheduleOverride, useCreateOneOffSchedule } from '@/hooks/use-schedules';
import { useEmployeesList } from '@/hooks/use-employees';
import { useDeleteChildLog } from '@/hooks/use-child-logs';
import { useCancelLeaveRequest } from '@/hooks/use-leave';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatTime12h, formatTime24h } from '@/lib/format-time';
import { format, startOfMonth, endOfMonth, subWeeks, addWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, CheckSquare, Clock, Settings, CheckCircle, Loader2, Moon, Utensils, Baby, ShowerHead, Gift, Briefcase, Pencil, Trash2, Plus } from 'lucide-react';

// Helper function to handle time input formatting
// Handles cases like: "0200" -> "2:00", "930" -> "9:30", backspacing, etc.
function formatTimeInput(value: string, previousValue: string): string {
  // Remove non-digit and non-colon characters
  const cleaned = value.replace(/[^\d:]/g, '');

  // If user is backspacing and the current value has a colon but cleaned doesn't have the colon at the end
  // Allow normal backspace behavior
  if (cleaned.length < previousValue.length) {
    // If the previous value had a colon and user is deleting, allow it
    if (previousValue.includes(':') && !cleaned.includes(':')) {
      // User deleted through the colon, just return digits
      return cleaned.replace(':', '');
    }
    return cleaned;
  }

  // Remove any existing colons for processing
  const digitsOnly = cleaned.replace(/:/g, '');

  // Limit to 4 digits total (HHMM)
  const limited = digitsOnly.slice(0, 4);

  if (limited.length === 0) {
    return '';
  }

  if (limited.length <= 2) {
    // Just hours or partial hours
    return limited;
  }

  // 3 or 4 digits: format as H:MM or HH:MM
  if (limited.length === 3) {
    // Could be H:MM (e.g., 930 -> 9:30)
    return `${limited[0]}:${limited.slice(1)}`;
  }

  // 4 digits: HH:MM (e.g., 0930 -> 09:30, but 0200 -> 2:00)
  const hours = limited.slice(0, 2);
  const minutes = limited.slice(2);

  // Remove leading zero for hours display (02 -> 2)
  const displayHours = hours.replace(/^0/, '') || '0';

  return `${displayHours}:${minutes}`;
}

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

  // Track the visible date range from FullCalendar
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);

  // Use visible range if available, otherwise fall back to current month
  // Add buffer of 1 week on each side to ensure smooth navigation
  const startDate = visibleRange
    ? format(subWeeks(visibleRange.start, 1), 'yyyy-MM-dd')
    : format(startOfMonth(currentDate), 'yyyy-MM-dd');
  const endDate = visibleRange
    ? format(addWeeks(visibleRange.end, 1), 'yyyy-MM-dd')
    : format(endOfMonth(currentDate), 'yyyy-MM-dd');

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
    showSchedules: isEmployee ? true : showSchedules,
    userId: isEmployee ? userId : undefined,
  });

  const router = useRouter();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const deleteFutureTasks = useDeleteFutureTasks();
  const updateTaskDateTime = useUpdateTaskDateTime();
  const updateTaskStatus = useUpdateTaskStatus();
  const upsertOverride = useUpsertScheduleOverride();
  const deleteOverride = useDeleteScheduleOverride();
  const createOneOffSchedule = useCreateOneOffSchedule();
  const deleteChildLog = useDeleteChildLog();
  const cancelLeaveRequest = useCancelLeaveRequest();
  const { data: employees } = useEmployeesList();

  // Task delete confirmation state
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteTaskTitle, setDeleteTaskTitle] = useState<string>('');

  // Get batch info for the task being deleted
  const batchInfo = useTaskBatchInfo(deleteTaskId);

  // Log delete confirmation state
  const [deleteLogDialog, setDeleteLogDialog] = useState<{
    open: boolean;
    logId: string;
    title: string;
  } | null>(null);

  // Leave cancel confirmation state
  const [cancelLeaveDialog, setCancelLeaveDialog] = useState<{
    open: boolean;
    leaveId: string;
    title: string;
  } | null>(null);

  // Schedule editing state
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editStartAmPm, setEditStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [editEndTime, setEditEndTime] = useState('');
  const [editEndAmPm, setEditEndAmPm] = useState<'AM' | 'PM'>('PM');

  // Add schedule dialog state
  const [addScheduleDialog, setAddScheduleDialog] = useState<{
    open: boolean;
    date: Date;
    dayOfWeek: number;
  } | null>(null);
  const [newScheduleEmployee, setNewScheduleEmployee] = useState('');
  const [newScheduleStartTime, setNewScheduleStartTime] = useState('');
  const [newScheduleStartAmPm, setNewScheduleStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [newScheduleEndTime, setNewScheduleEndTime] = useState('');
  const [newScheduleEndAmPm, setNewScheduleEndAmPm] = useState<'AM' | 'PM'>('PM');

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

  // Handle clicking on empty time slot to add schedule
  const handleDateClick = (info: { date: Date; dateStr: string; allDay: boolean }) => {
    if (isEmployee) return; // Only admins can add schedules

    const clickedDate = info.date;
    const dayOfWeek = clickedDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Pre-fill start time from clicked time slot if not all-day click
    let defaultStartTime = '9:00';
    let defaultStartAmPm: 'AM' | 'PM' = 'AM';

    if (!info.allDay) {
      const hours = clickedDate.getHours();
      const minutes = clickedDate.getMinutes();
      const isPm = hours >= 12;
      const h12 = hours % 12 || 12;
      defaultStartTime = `${h12}:${minutes.toString().padStart(2, '0')}`;
      defaultStartAmPm = isPm ? 'PM' : 'AM';
    }

    // Default end time is 1 hour after start
    let defaultEndTime = '10:00';
    let defaultEndAmPm: 'AM' | 'PM' = 'AM';

    if (!info.allDay) {
      const endDate = new Date(clickedDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      const hours = endDate.getHours();
      const minutes = endDate.getMinutes();
      const isPm = hours >= 12;
      const h12 = hours % 12 || 12;
      defaultEndTime = `${h12}:${minutes.toString().padStart(2, '0')}`;
      defaultEndAmPm = isPm ? 'PM' : 'AM';
    }

    setNewScheduleEmployee('');
    setNewScheduleStartTime(defaultStartTime);
    setNewScheduleStartAmPm(defaultStartAmPm);
    setNewScheduleEndTime(defaultEndTime);
    setNewScheduleEndAmPm(defaultEndAmPm);
    setAddScheduleDialog({
      open: true,
      date: clickedDate,
      dayOfWeek,
    });
  };

  // Handle creating new one-off schedule
  const handleCreateSchedule = async () => {
    if (!addScheduleDialog || !newScheduleEmployee || !newScheduleStartTime || !newScheduleEndTime) return;

    const startTime24 = formatTime24h(`${newScheduleStartTime} ${newScheduleStartAmPm}`);
    const endTime24 = formatTime24h(`${newScheduleEndTime} ${newScheduleEndAmPm}`);

    // Validate time format
    if (!startTime24 || !endTime24) return;

    const scheduleDate = format(addScheduleDialog.date, 'yyyy-MM-dd');

    await createOneOffSchedule.mutateAsync({
      userId: newScheduleEmployee,
      scheduleDate,
      startTime: startTime24,
      endTime: endTime24,
    });

    setAddScheduleDialog(null);
    refetch();
  };

  // Track if user manually changed the view (don't auto-switch after manual selection)
  const userChangedView = useRef(false);

  // Set initial view based on screen size on mount only
  useEffect(() => {
    // Only auto-switch on resize if user hasn't manually changed the view
    const handleResize = () => {
      if (userChangedView.current) return;

      const isMobile = window.innerWidth < 768;
      const defaultView = isMobile ? 'timeGridTwoDay' : 'timeGridWeek';

      if (defaultView !== currentView) {
        setCurrentView(defaultView);
        calendarRef.current?.getApi().changeView(defaultView);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentView]);

  const handleCompleteTask = async (eventId: string) => {
    // Extract the actual task ID from the event ID
    // Format: task-{uuid}
    const withoutPrefix = eventId.replace('task-', '');
    // UUID is 36 characters (including dashes)
    const actualTaskId = withoutPrefix.slice(0, 36);

    await completeTask.mutateAsync(actualTaskId);
    setSelectedEvent(null);
    refetch();
  };

  const handleUncompleteTask = async (eventId: string) => {
    // Extract the actual task ID from the event ID
    const withoutPrefix = eventId.replace('task-', '');
    const actualTaskId = withoutPrefix.slice(0, 36);

    // Set status back to pending
    await updateTaskStatus.mutateAsync({ id: actualTaskId, status: 'pending' });
    setSelectedEvent(null);
    refetch();
  };

  // Extract task ID from event ID (format: task-{uuid})
  const extractTaskId = (eventId: string): string => {
    const withoutPrefix = eventId.replace('task-', '');
    return withoutPrefix.slice(0, 36);
  };

  const handleEditTask = (eventId: string) => {
    const taskId = extractTaskId(eventId);
    setSelectedEvent(null);
    router.push(`/tasks/${taskId}/edit`);
  };

  const handleDeleteTaskSingle = async () => {
    if (!deleteTaskId) return;

    await deleteTask.mutateAsync(deleteTaskId);
    setDeleteTaskId(null);
    setDeleteTaskTitle('');
    setSelectedEvent(null);
    refetch();
  };

  const handleDeleteTaskFuture = async () => {
    if (!deleteTaskId) return;

    await deleteFutureTasks.mutateAsync(deleteTaskId);
    setDeleteTaskId(null);
    setDeleteTaskTitle('');
    setSelectedEvent(null);
    refetch();
  };

  const openDeleteTaskDialog = (eventId: string, title: string) => {
    const taskId = extractTaskId(eventId);
    setDeleteTaskId(taskId);
    setDeleteTaskTitle(title);
  };

  // Child log handlers
  const extractLogId = (eventId: string): string => {
    return eventId.replace('log-', '');
  };

  const handleEditLog = (eventId: string) => {
    const logId = extractLogId(eventId);
    setSelectedEvent(null);
    router.push(`/logs?edit=${logId}`);
  };

  const handleDeleteLog = async () => {
    if (!deleteLogDialog) return;

    await deleteChildLog.mutateAsync(deleteLogDialog.logId);
    setDeleteLogDialog(null);
    setSelectedEvent(null);
    refetch();
  };

  const openDeleteLogDialog = (eventId: string, title: string) => {
    const logId = extractLogId(eventId);
    setDeleteLogDialog({
      open: true,
      logId,
      title,
    });
  };

  // Leave request handlers
  const extractLeaveId = (eventId: string): string => {
    return eventId.replace('leave-', '');
  };

  const handleCancelLeave = async () => {
    if (!cancelLeaveDialog) return;

    await cancelLeaveRequest.mutateAsync(cancelLeaveDialog.leaveId);
    setCancelLeaveDialog(null);
    setSelectedEvent(null);
    refetch();
  };

  const openCancelLeaveDialog = (eventId: string, title: string) => {
    const leaveId = extractLeaveId(eventId);
    setCancelLeaveDialog({
      open: true,
      leaveId,
      title,
    });
  };

  // Important date handler - navigate to employee edit
  const handleEditImportantDate = (employeeId: string) => {
    setSelectedEvent(null);
    router.push(`/employees/${employeeId}/edit`);
  };

  // Handle drag and drop for calendar events
  const handleEventDrop = async (info: {
    event: {
      id: string;
      start: Date | null;
      end: Date | null;
      extendedProps: Record<string, unknown>;
    };
    revert: () => void;
  }) => {
    const eventId = info.event.id;
    const newStart = info.event.start;
    const newEnd = info.event.end;

    if (!newStart) {
      info.revert();
      return;
    }

    // Handle schedule events
    if (eventId.startsWith('schedule-')) {
      const scheduleId = info.event.extendedProps.scheduleId as string;
      const scheduleDate = info.event.extendedProps.scheduleDate as string;
      const newStartTime = format(newStart, 'HH:mm:ss');
      const newEndTime = newEnd ? format(newEnd, 'HH:mm:ss') : format(newStart, 'HH:mm:ss');

      try {
        await upsertOverride.mutateAsync({
          scheduleId,
          overrideDate: scheduleDate,
          startTime: newStartTime,
          endTime: newEndTime,
        });
        refetch();
      } catch {
        info.revert();
      }
      return;
    }

    // Handle task events
    if (!eventId.startsWith('task-')) {
      info.revert();
      return;
    }

    const taskId = extractTaskId(eventId);
    const newDate = format(newStart, 'yyyy-MM-dd');
    const newTime = format(newStart, 'HH:mm:ss');
    const isActivity = !!info.event.extendedProps.isActivity;

    try {
      // Update the due date/time directly
      if (isActivity && newEnd) {
        const newEndTime = format(newEnd, 'HH:mm:ss');
        await updateTaskDateTime.mutateAsync({
          taskId,
          dueDate: newDate,
          dueTime: newTime,
          startTime: newTime,
          endTime: newEndTime,
        });
      } else {
        await updateTaskDateTime.mutateAsync({
          taskId,
          dueDate: newDate,
          dueTime: newTime,
        });
      }
      refetch();
    } catch {
      info.revert();
    }
  };

  // Handle resize for calendar events (dragging the bottom edge)
  const handleEventResize = async (info: {
    event: {
      id: string;
      start: Date | null;
      end: Date | null;
      extendedProps: Record<string, unknown>;
    };
    revert: () => void;
  }) => {
    const eventId = info.event.id;
    const start = info.event.start;
    const newEnd = info.event.end;

    if (!start || !newEnd) {
      info.revert();
      return;
    }

    // Handle schedule events - only update end time
    if (eventId.startsWith('schedule-')) {
      const scheduleId = info.event.extendedProps.scheduleId as string;
      const scheduleDate = info.event.extendedProps.scheduleDate as string;
      const startTime = format(start, 'HH:mm:ss');
      const newEndTime = format(newEnd, 'HH:mm:ss');

      try {
        await upsertOverride.mutateAsync({
          scheduleId,
          overrideDate: scheduleDate,
          startTime: startTime,
          endTime: newEndTime,
        });
        refetch();
      } catch {
        info.revert();
      }
      return;
    }

    // Handle task events - only update end time for activities
    if (!eventId.startsWith('task-')) {
      info.revert();
      return;
    }

    const taskId = extractTaskId(eventId);
    const isActivity = !!info.event.extendedProps.isActivity;

    // Only activities have meaningful end times
    if (!isActivity) {
      info.revert();
      return;
    }

    const dueDate = format(start, 'yyyy-MM-dd');
    const startTime = format(start, 'HH:mm:ss');
    const newEndTime = format(newEnd, 'HH:mm:ss');

    try {
      await updateTaskDateTime.mutateAsync({
        taskId,
        dueDate,
        dueTime: startTime,
        startTime: startTime,
        endTime: newEndTime,
      });
      refetch();
    } catch {
      info.revert();
    }
  };

  const handlePrev = () => {
    calendarRef.current?.getApi().prev();
    // datesSet callback will update currentDate and visibleRange
  };

  const handleNext = () => {
    calendarRef.current?.getApi().next();
    // datesSet callback will update currentDate and visibleRange
  };

  const handleToday = () => {
    calendarRef.current?.getApi().today();
    // datesSet callback will update currentDate and visibleRange
  };

  const handleViewChange = (view: ViewType) => {
    userChangedView.current = true; // User manually changed view, don't auto-switch
    setCurrentView(view);
    calendarRef.current?.getApi().changeView(view);
  };

  // Touch swipe support for mobile navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    // Only trigger if horizontal swipe is significant and greater than vertical
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
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
              type="button"
              variant={currentView === 'timeGridDay' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none text-xs sm:text-sm px-2 sm:px-3"
              onClick={() => handleViewChange('timeGridDay')}
            >
              {t('calendar.day')}
            </Button>
            <Button
              type="button"
              variant={currentView === 'timeGridTwoDay' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-x text-xs sm:text-sm px-2 sm:px-3"
              onClick={() => handleViewChange('timeGridTwoDay')}
            >
              2D
            </Button>
            <Button
              type="button"
              variant={currentView === 'timeGridWeek' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-x text-xs sm:text-sm px-2 sm:px-3"
              onClick={() => handleViewChange('timeGridWeek')}
            >
              {t('calendar.week')}
            </Button>
            <Button
              type="button"
              variant={currentView === 'dayGridMonth' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none text-xs sm:text-sm px-2 sm:px-3"
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
              {!isEmployee && (
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
          <div
            className={`calendar-wrapper ${isLoading ? 'opacity-50' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
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
              events={events?.map((e) => {
                const isCompleted = e.extendedProps?.status === 'completed';
                const isViewOnly = e.extendedProps?.isViewOnly === true;
                return {
                  id: e.id,
                  title: e.title,
                  start: e.start,
                  end: e.end,
                  allDay: e.allDay,
                  backgroundColor: e.color,
                  borderColor: e.color,
                  extendedProps: e.extendedProps,
                  classNames: [
                    isCompleted ? 'fc-event-completed' : '',
                    isViewOnly ? 'fc-event-view-only' : '',
                  ].filter(Boolean),
                };
              }) || []}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              selectable={!isEmployee}
              datesSet={(dateInfo) => {
                // Update visible range when calendar navigates
                setVisibleRange({ start: dateInfo.start, end: dateInfo.end });
                // Update currentDate to match the view's current position
                setCurrentDate(dateInfo.view.currentStart);
              }}
              editable={!isEmployee}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventStartEditable={!isEmployee}
              eventDurationEditable={!isEmployee}
              droppable={false}
              height="auto"
              dayMaxEvents={3}
              eventDisplay="block"
              snapDuration="00:15:00"
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
        <Card className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-80 shadow-lg z-50 max-h-[70vh] overflow-y-auto">
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

                {/* View Only Notice */}
                {!!selectedEvent.extendedProps.isViewOnly && (
                  <div className="mt-2 p-2 bg-slate-100 rounded-md text-center">
                    <p className="text-sm text-muted-foreground">
                      {t('tasks.viewOnlyNotice')}
                    </p>
                  </div>
                )}

                {/* Mark Complete Button - hide for view-only tasks */}
                {String(selectedEvent.extendedProps.status) !== 'completed' && !selectedEvent.extendedProps.isViewOnly && (
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

                {/* Undo Complete Button - show for completed tasks, hide for view-only */}
                {String(selectedEvent.extendedProps.status) === 'completed' && !selectedEvent.extendedProps.isViewOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => handleUncompleteTask(selectedEvent.id)}
                    disabled={updateTaskStatus.isPending}
                  >
                    {updateTaskStatus.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    {t('tasks.undoComplete')}
                  </Button>
                )}

                {/* Edit and Delete Buttons (Admin only) */}
                {!isEmployee && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleEditTask(selectedEvent.id)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => openDeleteTaskDialog(selectedEvent.id, selectedEvent.title)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('common.delete')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {selectedEvent.type === 'leave' && (
              <div className="mt-3 space-y-3">
                <Badge
                  variant="secondary"
                  className={Boolean(selectedEvent.extendedProps.isHoliday) ? 'bg-amber-100 text-amber-700' : ''}
                >
                  {Boolean(selectedEvent.extendedProps.isHoliday)
                    ? t('leave.holiday')
                    : (String(selectedEvent.extendedProps.leaveType) === 'vacation' || String(selectedEvent.extendedProps.leaveType) === 'pto')
                      ? t('leave.pto')
                      : t('leave.sick')}
                </Badge>
                {Boolean(selectedEvent.extendedProps.isHoliday) && selectedEvent.extendedProps.holidayName ? (
                  <p className="text-sm font-medium mt-2">
                    {String(selectedEvent.extendedProps.holidayName)}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {String(selectedEvent.extendedProps.totalDays)} {t('common.days')}
                </p>
                {/* Cancel button for pending leave requests (not holidays) */}
                {!isEmployee && !Boolean(selectedEvent.extendedProps.isHoliday) && String(selectedEvent.extendedProps.status) === 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => openCancelLeaveDialog(selectedEvent.id, selectedEvent.title)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('leave.cancelLeave')}
                  </Button>
                )}
              </div>
            )}

            {selectedEvent.type === 'log' && (
              <div className="mt-3 space-y-3">
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
                {/* Edit and Delete buttons for logs (Admin only) */}
                {!isEmployee && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleEditLog(selectedEvent.id)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => openDeleteLogDialog(selectedEvent.id, selectedEvent.title)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('common.delete')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {selectedEvent.type === 'important_date' && (
              <div className="mt-3 space-y-3">
                <Badge variant="secondary" className="bg-pink-100 text-pink-700">
                  {String(selectedEvent.extendedProps.label)}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {String(selectedEvent.extendedProps.employeeName)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Recurring annually
                </p>
                {/* Edit button to navigate to employee profile (Admin only) */}
                {!isEmployee && !!selectedEvent.extendedProps.employeeId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleEditImportantDate(String(selectedEvent.extendedProps.employeeId))}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {t('common.edit')}
                  </Button>
                )}
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
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-12">Start:</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(formatTimeInput(e.target.value, editStartTime))}
                          placeholder="9:00"
                          className="w-20"
                        />
                        <div className="flex rounded-lg border-2 overflow-hidden flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditStartAmPm('AM')}
                            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                              editStartAmPm === 'PM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background hover:bg-muted'
                            }`}
                          >
                            PM
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-12">End:</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(formatTimeInput(e.target.value, editEndTime))}
                          placeholder="5:00"
                          className="w-20"
                        />
                        <div className="flex rounded-lg border-2 overflow-hidden flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditEndAmPm('AM')}
                            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                              editEndAmPm === 'PM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background hover:bg-muted'
                            }`}
                          >
                            PM
                          </button>
                        </div>
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
                          // Validate time format
                          if (!startTime24 || !endTime24) return;
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

      {/* Delete Task Confirmation Dialog */}
      <AlertDialog open={!!deleteTaskId} onOpenChange={(open) => { if (!open) { setDeleteTaskId(null); setDeleteTaskTitle(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tasks.deleteTask')}</AlertDialogTitle>
            <AlertDialogDescription>
              {batchInfo.isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </span>
              ) : batchInfo.isRepeating ? (
                t('tasks.deleteRepeatingConfirmation', { count: batchInfo.futureCount })
              ) : (
                t('tasks.deleteConfirmation')
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={batchInfo.isRepeating ? 'flex-col sm:flex-row gap-2' : ''}>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            {batchInfo.isLoading ? null : batchInfo.isRepeating ? (
              <>
                <AlertDialogAction
                  onClick={handleDeleteTaskSingle}
                  className="bg-orange-600 hover:bg-orange-700"
                  disabled={deleteTask.isPending}
                >
                  {deleteTask.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {t('tasks.deleteThisOnly')}
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={handleDeleteTaskFuture}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={deleteFutureTasks.isPending}
                >
                  {deleteFutureTasks.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {t('tasks.deleteAllFuture', { count: batchInfo.futureCount })}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={handleDeleteTaskSingle}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteTask.isPending}
              >
                {deleteTask.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {t('common.delete')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Log Confirmation Dialog */}
      <AlertDialog open={!!deleteLogDialog?.open} onOpenChange={(open) => !open && setDeleteLogDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('childLogs.deleteLog')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('childLogs.deleteConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLog}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteChildLog.isPending}
            >
              {deleteChildLog.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Leave Confirmation Dialog */}
      <AlertDialog open={!!cancelLeaveDialog?.open} onOpenChange={(open) => !open && setCancelLeaveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leave.cancelLeave')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leave.cancelConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelLeave}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelLeaveRequest.isPending}
            >
              {cancelLeaveRequest.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Schedule Dialog */}
      <Dialog open={!!addScheduleDialog?.open} onOpenChange={(open) => !open && setAddScheduleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('employees.addSchedule')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {addScheduleDialog && (
              <p className="text-sm text-muted-foreground">
                {t('employees.scheduleFor', {
                  day: format(addScheduleDialog.date, 'EEEE, MMMM d, yyyy'),
                })}
              </p>
            )}

            <div className="space-y-2">
              <Label>{t('employees.selectEmployee')}</Label>
              <Select value={newScheduleEmployee} onValueChange={setNewScheduleEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('employees.startTime')}</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={newScheduleStartTime}
                  onChange={(e) => setNewScheduleStartTime(formatTimeInput(e.target.value, newScheduleStartTime))}
                  placeholder="9:00"
                  className="w-24"
                />
                <div className="flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNewScheduleStartAmPm('AM')}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      newScheduleStartAmPm === 'AM'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewScheduleStartAmPm('PM')}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      newScheduleStartAmPm === 'PM'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('employees.endTime')}</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={newScheduleEndTime}
                  onChange={(e) => setNewScheduleEndTime(formatTimeInput(e.target.value, newScheduleEndTime))}
                  placeholder="5:00"
                  className="w-24"
                />
                <div className="flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNewScheduleEndAmPm('AM')}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      newScheduleEndAmPm === 'AM'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewScheduleEndAmPm('PM')}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      newScheduleEndAmPm === 'PM'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddScheduleDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateSchedule}
              disabled={!newScheduleEmployee || !newScheduleStartTime || !newScheduleEndTime || createOneOffSchedule.isPending}
            >
              {createOneOffSchedule.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        /* Completed task styles */
        .calendar-wrapper .fc-event-completed {
          opacity: 0.7;
          border-left: 3px solid #22c55e !important;
        }
        .calendar-wrapper .fc-event-completed .fc-event-title {
          text-decoration: line-through;
        }
        .calendar-wrapper .fc-event-completed .fc-event-main {
          text-decoration: line-through;
        }
        /* View-only task styles */
        .calendar-wrapper .fc-event-view-only {
          opacity: 0.6;
          border-style: dashed !important;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
