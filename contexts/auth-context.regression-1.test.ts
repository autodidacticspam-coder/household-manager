import { describe, expect, it } from 'vitest';
import { isMissingAuthSession } from '@/contexts/auth-context';

// Regression: ISSUE-004 — logged-out visitors produced a console error on /babysitting
// Found by /qa on 2026-08-05
// Report: .gstack/qa-reports/qa-report-household-manager-two-vercel-app-2026-08-05.md
describe('missing auth session detection', () => {
  it('recognizes the normal Supabase logged-out error', () => {
    expect(isMissingAuthSession({
      name: 'AuthSessionMissingError',
      message: 'Auth session missing!',
    })).toBe(true);
  });

  it('does not hide unexpected authentication failures', () => {
    expect(isMissingAuthSession({
      name: 'AuthApiError',
      message: 'Database unavailable',
    })).toBe(false);
  });
});
