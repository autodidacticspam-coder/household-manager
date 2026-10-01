import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import type { TaskTemplate } from '@/types';

const createTask = vi.fn();

// Radix checkboxes measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/use-feedback', () => ({
  useFeedback: () => (message: string) => message,
}));

vi.mock('@/hooks/use-tasks', () => {
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    useTaskCategories: () => ({ data: [], isLoading: false }),
    useEmployeeGroups: () => ({ data: [{ id: NANNY_GROUP_ID, name: 'Nanny' }], isLoading: false }),
    useEmployees: () => ({ data: [{ id: WENDY_ID, full_name: 'Wendy', email: 'wendy@example.com' }], isLoading: false }),
    useCreateTask: () => ({ mutateAsync: createTask, isPending: false }),
    useUpdateTask: () => mutation,
    useUpdateFutureTasks: () => mutation,
  };
});

vi.mock('@/hooks/use-task-templates', () => {
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    useTaskTemplates: () => ({ data: [] }),
    useCreateTaskTemplate: () => mutation,
    useUpdateTaskTemplate: () => mutation,
    useDeleteTaskTemplate: () => mutation,
  };
});

vi.mock('@/components/admin/task-videos-section', () => ({
  TaskVideosSection: () => null,
}));

const WENDY_ID = '11111111-1111-4111-8111-111111111111';
const NANNY_GROUP_ID = '22222222-2222-4222-8222-222222222222';

import { TaskForm } from '@/components/admin/task-form';

function tennisTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Zander tennis',
    title: 'Zander tennis',
    description: null,
    categoryId: null,
    priority: 'medium',
    isAllDay: false,
    defaultTime: null,
    isActivity: true,
    startTime: '07:45:00',
    endTime: '08:45:00',
    repeatDays: null,
    repeatInterval: null,
    defaultAssignments: [],
    defaultViewers: [],
    createdBy: null,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    ...overrides,
  };
}

function renderForm(template: TaskTemplate) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">
      <TaskForm template={template} />
    </NextIntlClientProvider>
  );
}

// Regression: a task made from a template with nobody on it saved silently and
// was then visible only to admins (Wendy never saw Zander's tennis lesson).
describe('TaskForm audience check', () => {
  afterEach(cleanup);

  beforeEach(() => {
    createTask.mockReset();
    createTask.mockResolvedValue({});
  });

  it('asks before saving a task that only admins could see', async () => {
    renderForm(tennisTemplate());

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Only admins will see this')).toBeTruthy();
    expect(createTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByText('Only admins will see this')).toBeNull());
    expect(createTask).not.toHaveBeenCalled();
  });

  it('saves the admin-only task after "Save anyway"', async () => {
    renderForm(tennisTemplate());

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save anyway' }));

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0][0]).toMatchObject({
      title: 'Zander tennis',
      assignments: [],
      viewers: [],
    });
  });

  it('saves straight away when the template names who should see it', async () => {
    renderForm(tennisTemplate({
      defaultAssignments: [{ targetType: 'user', targetUserId: WENDY_ID, targetGroupId: null }],
      defaultViewers: [{ targetType: 'group', targetUserId: null, targetGroupId: NANNY_GROUP_ID }],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Only admins will see this')).toBeNull();
    expect(createTask.mock.calls[0][0]).toMatchObject({
      assignments: [{ targetType: 'user', targetUserId: WENDY_ID }],
      viewers: [{ targetType: 'group', targetGroupId: NANNY_GROUP_ID }],
    });
  });
});
