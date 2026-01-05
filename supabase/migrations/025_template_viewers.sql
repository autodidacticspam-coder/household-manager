-- Add default_viewers column to task_templates table
-- Stores viewer assignments similar to default_assignments
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS default_viewers JSONB DEFAULT '[]';
