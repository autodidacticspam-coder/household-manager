'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { login, type AuthState } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const resetSuccess = searchParams.get('reset') === 'success';

  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    login,
    {}
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {t('auth.welcomeBack')}
          </CardTitle>
          <CardDescription className="text-center">
            {t('auth.signInDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <Alert className="mb-4 bg-green-50 text-green-800 border-green-200">
              <AlertDescription>
                {t('auth.passwordResetSuccess')}
              </AlertDescription>
            </Alert>
          )}

          {state.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <form action={formAction} className="space-y-4">
            {redirectTo && (
              <input type="hidden" name="redirectTo" value={redirectTo} />
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                required
                autoComplete="email"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                disabled={isPending}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('auth.login')
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>{t('auth.noAccount')}</p>
            <p>{t('auth.contactAdmin')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
