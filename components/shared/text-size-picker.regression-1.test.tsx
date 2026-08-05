import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { TextSizeCard } from '@/components/shared/text-size-picker';

// Regression: ISSUE-003 — text size initialization failed the React effect lint rule
// Found by /qa on 2026-08-05
// Report: .gstack/qa-reports/qa-report-household-manager-two-vercel-app-2026-08-05.md
describe('TextSizeCard', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-text-scale');
  });

  it('reads stored scale and synchronizes same-tab changes without an effect', () => {
    localStorage.setItem('hm-text-scale', 'lg');
    render(<TextSizeCard />);

    expect(screen.getByRole('button', { name: /textSize\.large/ }).className).toContain('border-primary');

    fireEvent.click(screen.getByRole('button', { name: /textSize\.extraLarge/ }));

    expect(localStorage.getItem('hm-text-scale')).toBe('xl');
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('xl');
    expect(screen.getByRole('button', { name: /textSize\.extraLarge/ }).className).toContain('border-primary');
  });
});
