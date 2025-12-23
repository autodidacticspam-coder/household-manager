import { z } from 'zod';

export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed']);
export const assignmentTargetTypeSchema = z.enum(['user', 'group', 'all', 'all_admins']);

export const taskAssignmentSchema = z.object({
  targetType: assignmentTargetTypeSchema,
  targetUserId: z.string().uuid().nullable().optional(),
  targetGroupId: z.string().uuid().nullable().optional(),
}).refine((data) => {
  if (data.targetType === 'user') {
    return !!data.targetUserId;
  }
  if (data.targetType === 'group') {
    return !!data.targetGroupId;
  }
  return true;
}, {
  message: 'Target ID is required for user or group assignments',
});

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  priority: taskPrioritySchema.default('medium'),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  isAllDay: z.boolean().default(true),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().nullable().optional(),
  syncToCalendar: z.boolean().default(false),
  assignments: z.array(taskAssignmentSchema).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: taskStatusSchema.optional(),
});

export const completeTaskSchema = z.object({
  taskId: z.string().uuid(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskAssignmentInput = z.infer<typeof taskAssignmentSchema>;
