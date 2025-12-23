'use client';

import { useTranslations } from 'next-intl';
import { LeaveRequestForm } from '@/components/employee/leave-request-form';

export default function RequestTimeOffPage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('leave.requestTimeOff')}</h1>
        <p className="text-muted-foreground">
          Submit a new time off request for approval.
        </p>
      </div>

      <LeaveRequestForm />
    </div>
  );
}
