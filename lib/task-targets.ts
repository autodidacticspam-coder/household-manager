import type { TaskAssignmentInput } from '@/lib/validators/task';
import type { AssignmentTargetType } from '@/types';

/**
 * Include a selection that is still in the assignment/viewer picker.
 *
 * The task form lets an admin either click "Add" or submit/save while a
 * selection is still pending. Both paths should produce the same targets.
 */
export function withPendingTaskTarget(
  targets: readonly TaskAssignmentInput[],
  pendingType: AssignmentTargetType,
  pendingTargetId: string
): TaskAssignmentInput[] {
  const resolvedTargets = [...targets];

  const pendingTarget: TaskAssignmentInput | null = (() => {
    if (pendingType === 'all' || pendingType === 'all_admins') {
      return { targetType: pendingType };
    }

    if (!pendingTargetId) {
      return null;
    }

    return pendingType === 'user'
      ? { targetType: 'user', targetUserId: pendingTargetId }
      : { targetType: 'group', targetGroupId: pendingTargetId };
  })();

  if (!pendingTarget) {
    return resolvedTargets;
  }

  const isDuplicate = resolvedTargets.some((target) => {
    if (target.targetType !== pendingTarget.targetType) return false;
    if (pendingTarget.targetType === 'user') {
      return target.targetUserId === pendingTarget.targetUserId;
    }
    if (pendingTarget.targetType === 'group') {
      return target.targetGroupId === pendingTarget.targetGroupId;
    }
    return true;
  });

  return isDuplicate ? resolvedTargets : [...resolvedTargets, pendingTarget];
}
