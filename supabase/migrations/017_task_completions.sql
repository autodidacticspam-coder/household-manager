-- =====================================================
-- TASK COMPLETIONS
-- Tracks per-instance completions for recurring tasks
-- =====================================================

CREATE TABLE IF NOT EXISTS task_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completion_date DATE NOT NULL,
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure only one completion per task per date
    CONSTRAINT unique_task_completion UNIQUE (task_id, completion_date)
);

-- Index for efficient queries
CREATE INDEX idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX idx_task_completions_date ON task_completions(completion_date);

-- Enable RLS
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all completions
CREATE POLICY "Admins can manage all task completions" ON task_completions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
    );

-- Employees can view and create completions for tasks assigned to them
CREATE POLICY "Employees can view task completions" ON task_completions
    FOR SELECT USING (true);

CREATE POLICY "Employees can create task completions" ON task_completions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM task_assignments ta
            WHERE ta.task_id = task_completions.task_id
            AND (ta.target_type = 'all' OR (ta.target_type = 'user' AND ta.target_user_id = auth.uid()))
        )
    );
