-- =====================================================
-- ADD ACTIVITY MODE TO TASKS
-- Allows tasks to have start/end times instead of just due time
-- =====================================================

-- Add new columns for activity mode
ALTER TABLE tasks
ADD COLUMN is_activity BOOLEAN DEFAULT FALSE,
ADD COLUMN start_time TIME,
ADD COLUMN end_time TIME;

-- Add comment for documentation
COMMENT ON COLUMN tasks.is_activity IS 'When true, task uses start_time/end_time instead of due_time';
COMMENT ON COLUMN tasks.start_time IS 'Start time for activity mode tasks';
COMMENT ON COLUMN tasks.end_time IS 'End time for activity mode tasks';
