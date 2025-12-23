'use client';

import { useTranslations } from 'next-intl';
import { CalendarView } from '@/components/shared/calendar/calendar-view';

export default function AdminCalendarPage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('calendar.title')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.calendar')}
        </p>
      </div>

      <CalendarView />
    </div>
  );
}
