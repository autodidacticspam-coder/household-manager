-- Task Templates table for reusable task configurations
CREATE TABLE IF NOT EXISTS task_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES task_categories(id) ON DELETE SET NULL,
    priority task_priority DEFAULT 'medium',
    is_all_day BOOLEAN DEFAULT FALSE,
    default_time TIME,
    is_activity BOOLEAN DEFAULT FALSE,
    start_time TIME,
    end_time TIME,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,
    default_assignments JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_task_templates_created_by ON task_templates(created_by);

-- RLS policies
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with templates
CREATE POLICY "Admins can manage templates" ON task_templates
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Update trigger for updated_at
CREATE TRIGGER update_task_templates_updated_at
    BEFORE UPDATE ON task_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
