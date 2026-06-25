'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  clearAdminSwitchSession,
  readAdminSwitchSession,
  type StoredAdminSwitchSession,
} from '@/lib/account-switch';
import { Button } from '@/components/ui/button';

export function AccountSwitchBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const [switchSession, setSwitchSession] = useState<StoredAdminSwitchSession | null>(null);
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const stored = readAdminSwitchSession();
    if (!stored || !user || user.id === stored.adminUser.id) {
      setSwitchSession(null);
      return;
    }
    setSwitchSession(stored);
  }, [isLoading, user?.id, user]);

  if (!switchSession || !user) return null;

  const returnToAdmin = async () => {
    setIsReturning(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: switchSession.accessToken,
        refresh_token: switchSession.refreshToken,
      });

      if (error) {
        clearAdminSwitchSession();
        setSwitchSession(null);
        throw error;
      }

      clearAdminSwitchSession();
      setSwitchSession(null);
      queryClient.clear();
      toast.success(`Returned to ${switchSession.adminUser.fullName}`);
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not return to admin account');
    } finally {
      setIsReturning(false);
    }
  };

  return (
    <div className="fixed left-1/2 top-2 z-[80] w-[calc(100%-1rem)] max-w-3xl -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm text-amber-950">
          <UserRoundCog className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Viewing as <strong>{user.fullName}</strong>. Admin session: {switchSession.adminUser.fullName}.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={returnToAdmin}
          disabled={isReturning}
          className="h-8 shrink-0 border-amber-400 bg-white text-amber-950 hover:bg-amber-100"
        >
          {isReturning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Return to Admin
        </Button>
      </div>
    </div>
  );
}
