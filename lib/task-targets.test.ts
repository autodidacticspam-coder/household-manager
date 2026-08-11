import { describe, expect, it } from 'vitest';
import { withPendingTaskTarget } from './task-targets';

describe('withPendingTaskTarget', () => {
  it('captures pending assignment and viewer selections when saving a template', () => {
    const wendyId = '11111111-1111-4111-8111-111111111111';
    const nannyGroupId = '22222222-2222-4222-8222-222222222222';

    expect(withPendingTaskTarget([], 'user', wendyId)).toEqual([
      { targetType: 'user', targetUserId: wendyId },
    ]);
    expect(withPendingTaskTarget([], 'group', nannyGroupId)).toEqual([
      { targetType: 'group', targetGroupId: nannyGroupId },
    ]);
  });

  it('does not duplicate a selection that was already added', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const existingTargets = [{ targetType: 'user' as const, targetUserId: userId }];

    expect(withPendingTaskTarget(existingTargets, 'user', userId)).toEqual(existingTargets);
  });
});
