'use client';

import { useState, useActionState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { login, type AuthState } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type LoginStep = 'email' | 'password';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const resetSuccess = searchParams.get('reset') === 'success';

  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    login,
    {}
  );

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCheckingRole(true);

    try {
      const response = await fetch('/api/auth/check-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t('auth.invalidCredentials'));
        setIsCheckingRole(false);
        return;
      }

      setUserName(data.fullName);

      if (data.role === 'admin') {
        // Admin needs password
        setStep('password');
        setIsCheckingRole(false);
      } else {
        // Employee - passwordless login
        setIsLoggingIn(true);
        await handleEmployeeLogin();
      }
    } catch (err) {
      setError(t('errors.network'));
      setIsCheckingRole(false);
    }
  };

  const handleEmployeeLogin = async () => {
    try {
      const response = await fetch('/api/auth/employee-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.isAdmin) {
          setStep('password');
          setIsLoggingIn(false);
          setIsCheckingRole(false);
          return;
        }
        setError(data.error || t('errors.general'));
        setIsLoggingIn(false);
        setIsCheckingRole(false);
        return;
      }

      // Use the magic link to sign in
      if (data.actionLink) {
        // Extract token from the action link and verify it
        const supabase = createClient();

        // Parse the URL to get the token
        const url = new URL(data.actionLink);
        const token = url.searchParams.get('token');
        const type = url.searchParams.get('type');

        if (token && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: type as 'magiclink',
          });

          if (verifyError) {
            console.error('Verify error:', verifyError);
            setError(t('errors.general'));
            setIsLoggingIn(false);
            setIsCheckingRole(false);
            return;
          }

          // Redirect to employee dashboard
          router.push(redirectTo || '/my-tasks');
          router.refresh();
        } else {
          setError(t('errors.general'));
          setIsLoggingIn(false);
          setIsCheckingRole(false);
        }
      }
    } catch (err) {
      console.error('Employee login error:', err);
      setError(t('errors.network'));
      setIsLoggingIn(false);
      setIsCheckingRole(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setError(null);
  };

  const isLoading = isCheckingRole || isLoggingIn || isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {t('auth.welcomeBack')}
          </CardTitle>
          <CardDescription className="text-center">
            {step === 'email'
              ? t('auth.signInDescription')
              : t('auth.enterPassword', { name: userName })
            }
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

          {(error || state.error) && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error || state.error}</AlertDescription>
            </Alert>
          )}

          {isLoggingIn && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">{t('auth.signingIn')}</p>
            </div>
          )}

          {!isLoggingIn && step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  autoComplete="email"
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isCheckingRole ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('common.next')
                )}
              </Button>
            </form>
          )}

          {!isLoggingIn && step === 'password' && (
            <form action={formAction} className="space-y-4">
              {redirectTo && (
                <input type="hidden" name="redirectTo" value={redirectTo} />
              )}
              <input type="hidden" name="email" value={email} />

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {email}
                </button>
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
                  autoFocus
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
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>{t('auth.noAccount')}</p>
            <p>{t('auth.contactAdmin')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
