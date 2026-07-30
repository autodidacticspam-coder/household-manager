'use client';

import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import { formatTime12h } from '@/lib/format-time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { BookingRequest } from '@/types';

export function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export const STATUS_BADGES: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
};

// One booking request as a compact row: who, when, optional note,
// plus an optional extra meta line (e.g. asked/replied timestamps)
export function RequestSummary({ request, meta }: { request: BookingRequest; meta?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={request.babysitter?.avatarUrl || undefined} />
        <AvatarFallback>{initials(request.babysitter?.fullName || '?')}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {request.babysitter?.fullName}
          <span className="font-normal text-muted-foreground">
            {' '}&middot; {format(parseLocalDate(request.requestDate), 'EEE, MMM d')}{' '}
            &middot; {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
          </span>
        </div>
        {request.note && (
          <div className="truncate text-xs italic text-muted-foreground">&ldquo;{request.note}&rdquo;</div>
        )}
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
    </div>
  );
}
