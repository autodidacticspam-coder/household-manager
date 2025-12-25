-- =====================================================
-- TASK SKIPPED INSTANCES
-- Tracks skipped instances for recurring tasks (skip single occurrence)
-- =====================================================

CREATE TABLE IF NOT EXISTS task_skipped_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    skipped_date DATE NOT NULL,
    skipped_by UUID REFERENCES users(id),
    skipped_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure only one skip per task per date
    CONSTRAINT unique_task_skip UNIQUE (task_id, skipped_date)
);

-- Index for efficient queries
CREATE INDEX idx_task_skipped_task_id ON task_skipped_instances(task_id);
CREATE INDEX idx_task_skipped_date ON task_skipped_instances(skipped_date);

-- Enable RLS
ALTER TABLE task_skipped_instances ENABLE ROW LEVEL SECURITY;

-- Admins can manage all skipped instances
CREATE POLICY "Admins can manage all task skipped instances" ON task_skipped_instances
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
    );

-- =====================================================
-- TASK INSTANCE OVERRIDES
-- Tracks time overrides for recurring task instances (drag and drop)
-- =====================================================

CREATE TABLE IF NOT EXISTS task_instance_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    instance_date DATE NOT NULL,
    override_time TIME,
    override_start_time TIME,
    override_end_time TIME,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure only one override per task per date
    CONSTRAINT unique_task_override UNIQUE (task_id, instance_date)
);

-- Index for efficient queries
CREATE INDEX idx_task_override_task_id ON task_instance_overrides(task_id);
CREATE INDEX idx_task_override_date ON task_instance_overrides(instance_date);

-- Enable RLS
ALTER TABLE task_instance_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can manage all overrides
CREATE POLICY "Admins can manage all task instance overrides" ON task_instance_overrides
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
    );

-- Employees can view overrides
CREATE POLICY "Employees can view task instance overrides" ON task_instance_overrides
    FOR SELECT USING (true);
