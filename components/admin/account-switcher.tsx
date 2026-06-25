'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { clearAdminSwitchSession, saveAdminSwitchSession } from '@/lib/account-switch';
import { useEmployeesList, type Employee } from '@/hooks/use-employees';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

type SwitchResponse = {
  actionLink: string;
  redirectTo: string;
  targetUser: {
    id: string;
    email: string;
    fullName: string;
    role: 'admin' | 'employee';
  };
  error?: string;
};

export function AccountSwitcherDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: accounts = [], isLoading } = useEmployeesList();
  const [search, setSearch] = useState('');
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return accounts
      .filter((account) => account.id !== user?.id)
      .filter((account) => {
        if (!normalizedSearch) return true;
        return account.fullName.toLowerCase().includes(normalizedSearch) ||
          account.email.toLowerCase().includes(normalizedSearch) ||
          account.groups.some((group) => group.name.toLowerCase().includes(normalizedSearch));
      });
  }, [accounts, search, user?.id]);

  const switchToAccount = async (account: Employee) => {
    setSwitchingUserId(account.id);
    try {
      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const adminSession = sessionData.session;

      if (sessionError || !adminSession || !user) {
        throw new Error('Admin session is not available');
      }

      const response = await fetch('/api/auth/admin-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: account.id }),
      });

      const data = await response.json() as SwitchResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Failed to switch account');
      }

      const url = new URL(data.actionLink);
      const token = url.searchParams.get('token');
      const type = url.searchParams.get('type');

      if (!token || type !== 'magiclink') {
        throw new Error('Switch token was invalid');
      }

      saveAdminSwitchSession({
        session: adminSession,
        adminName: user.fullName,
        targetUser: {
          id: data.targetUser.id,
          email: data.targetUser.email,
          fullName: data.targetUser.fullName,
        },
      });

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'magiclink',
      });

      if (verifyError) {
        throw verifyError;
      }

      queryClient.clear();
      onOpenChange(false);
      toast.success(`Viewing as ${data.targetUser.fullName}`);
      router.push(data.redirectTo);
      router.refresh();
    } catch (error) {
      clearAdminSwitchSession();
      toast.error(error instanceof Error ? error.message : 'Failed to switch account');
    } finally {
      setSwitchingUserId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundCog className="h-5 w-5" />
            Switch Account
          </DialogTitle>
          <DialogDescription>
            Open another household account in this browser tab. Your admin session is saved until you return.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or group"
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-[55vh] pr-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading accounts
            </div>
          ) : filteredAccounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No matching accounts
            </p>
          ) : (
            <div className="space-y-2">
              {filteredAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={account.avatarUrl || undefined} />
                    <AvatarFallback>{getInitials(account.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium leading-tight">{account.fullName}</p>
                      <Badge variant={account.role === 'admin' ? 'default' : 'secondary'}>
                        {account.role === 'admin' ? 'Admin' : 'Employee'}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{account.email}</p>
                    {account.groups.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {account.groups.map((group) => group.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => switchToAccount(account)}
                    disabled={switchingUserId !== null}
                    className="shrink-0"
                  >
                    {switchingUserId === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Switch'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}
