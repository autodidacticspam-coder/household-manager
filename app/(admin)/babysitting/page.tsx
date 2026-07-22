'use client';

import { useAuth } from '@/contexts/auth-context';
import { useIsBabysitter } from '@/hooks/use-babysitting';
import { AdminBabysittingView } from '@/components/babysitting/admin-view';
import { BabysitterView } from '@/components/babysitting/babysitter-view';
import { Loader2, ShieldX } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function BabysittingPage() {
  const t = useTranslations();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { data: isBabysitter, isLoading: babysitterLoading } = useIsBabysitter();

  if (authLoading || babysitterLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin) {
    return <AdminBabysittingView />;
  }

  if (isBabysitter) {
    return <BabysitterView />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldX className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">{t('babysitting.accessRestrictedTitle')}</h2>
      <p className="text-muted-foreground max-w-md">{t('babysitting.accessRestricted')}</p>
    </div>
  );
}
