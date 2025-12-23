-- =====================================================
-- CHILD LOGS TABLE
-- For tracking sleep, food, poop for children
-- =====================================================

-- Create enum for log categories
CREATE TYPE child_log_category AS ENUM ('sleep', 'food', 'poop');

-- Create enum for children (can be expanded later)
CREATE TYPE child_name AS ENUM ('Zoe', 'Zara', 'Zander');

-- Create child_logs table
CREATE TABLE child_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child child_name NOT NULL,
    category child_log_category NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    log_time TIME NOT NULL,
    start_time TIME,  -- For sleep: when sleep started
    end_time TIME,    -- For sleep: when sleep ended
    description TEXT,
    logged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_child_logs_child ON child_logs(child);
CREATE INDEX idx_child_logs_category ON child_logs(category);
CREATE INDEX idx_child_logs_date ON child_logs(log_date);
CREATE INDEX idx_child_logs_logged_by ON child_logs(logged_by);

-- Create trigger for updated_at
CREATE TRIGGER update_child_logs_updated_at
    BEFORE UPDATE ON child_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE child_logs ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all child logs"
    ON child_logs FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Nannies and Teachers can view and create logs
CREATE POLICY "Nannies and Teachers can view child logs"
    ON child_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN employee_group_memberships egm ON u.id = egm.user_id
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE u.id = auth.uid()
            AND eg.name IN ('Nanny', 'Teacher')
        )
    );

CREATE POLICY "Nannies and Teachers can create child logs"
    ON child_logs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            JOIN employee_group_memberships egm ON u.id = egm.user_id
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE u.id = auth.uid()
            AND eg.name IN ('Nanny', 'Teacher')
        )
    );

CREATE POLICY "Users can update their own logs"
    ON child_logs FOR UPDATE
    USING (logged_by = auth.uid())
    WITH CHECK (logged_by = auth.uid());

CREATE POLICY "Users can delete their own logs"
    ON child_logs FOR DELETE
    USING (logged_by = auth.uid());
