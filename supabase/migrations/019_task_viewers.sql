-- =====================================================
-- TASK VIEWERS (users who can view tasks but not interact)
-- =====================================================

-- Create task_viewers table (similar to task_assignments but for view-only access)
CREATE TABLE task_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    target_type assignment_target_type NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_group_id UUID REFERENCES employee_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_viewer CHECK (
        (target_type = 'user' AND target_user_id IS NOT NULL AND target_group_id IS NULL) OR
        (target_type = 'group' AND target_group_id IS NOT NULL AND target_user_id IS NULL) OR
        (target_type = 'all' AND target_user_id IS NULL AND target_group_id IS NULL) OR
        (target_type = 'all_admins' AND target_user_id IS NULL AND target_group_id IS NULL)
    )
);

-- Create indexes for efficient querying
CREATE INDEX idx_task_viewers_task_id ON task_viewers(task_id);
CREATE INDEX idx_task_viewers_target_user_id ON task_viewers(target_user_id);
CREATE INDEX idx_task_viewers_target_group_id ON task_viewers(target_group_id);

-- RLS Policies for task_viewers
ALTER TABLE task_viewers ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with task_viewers
CREATE POLICY "Admins can manage task_viewers" ON task_viewers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- Employees can view their own viewer assignments
CREATE POLICY "Users can view their own viewer assignments" ON task_viewers
    FOR SELECT
    USING (
        target_user_id = auth.uid() OR
        target_type = 'all' OR
        (target_type = 'all_admins' AND EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
        )) OR
        (target_type = 'group' AND EXISTS (
            SELECT 1 FROM employee_group_memberships
            WHERE employee_group_memberships.user_id = auth.uid()
            AND employee_group_memberships.group_id = task_viewers.target_group_id
        ))
    );
