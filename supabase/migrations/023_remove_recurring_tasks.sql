-- Migration: Remove recurring task system and simplify to individual task instances
-- Each task is now a standalone instance, created in batches when using repeat patterns

-- Drop tables that are no longer needed
DROP TABLE IF EXISTS task_skipped_instances;
DROP TABLE IF EXISTS task_completions;
DROP TABLE IF EXISTS task_instances;

-- Remove recurring-related columns from tasks table
ALTER TABLE tasks DROP COLUMN IF EXISTS is_recurring;
ALTER TABLE tasks DROP COLUMN IF EXISTS recurrence_rule;

-- Remove recurring-related columns from task_templates table
ALTER TABLE task_templates DROP COLUMN IF EXISTS is_recurring;
ALTER TABLE task_templates DROP COLUMN IF EXISTS recurrence_rule;

-- Add new columns to task_templates for the new repeat system
-- repeat_days: Array of day indices (0=Sunday, 1=Monday, ..., 6=Saturday)
-- repeat_interval: 'weekly', 'biweekly', 'monthly', or NULL for no repeat
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS repeat_days INTEGER[] DEFAULT NULL;
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS repeat_interval TEXT DEFAULT NULL;

-- Add constraint to validate repeat_interval values
ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS valid_repeat_interval;
ALTER TABLE task_templates ADD CONSTRAINT valid_repeat_interval
  CHECK (repeat_interval IS NULL OR repeat_interval IN ('weekly', 'biweekly', 'monthly'));

-- Drop old indexes that reference removed columns
DROP INDEX IF EXISTS idx_task_instances_parent;
DROP INDEX IF EXISTS idx_task_instances_date;
