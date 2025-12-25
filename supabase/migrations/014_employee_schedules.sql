-- =====================================================
-- EMPLOYEE WORK SCHEDULES
-- Weekly recurring schedules with support for split shifts
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure end_time is after start_time
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Index for efficient queries by user
CREATE INDEX idx_employee_schedules_user_id ON employee_schedules(user_id);

-- Index for efficient queries by day
CREATE INDEX idx_employee_schedules_day ON employee_schedules(day_of_week);

-- Enable RLS
ALTER TABLE employee_schedules ENABLE ROW LEVEL SECURITY;

-- Admins can manage all schedules
CREATE POLICY "Admins can manage all schedules" ON employee_schedules
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
    );

-- Employees can view their own schedules
CREATE POLICY "Employees can view own schedules" ON employee_schedules
    FOR SELECT USING (user_id = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_employee_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employee_schedules_updated_at
    BEFORE UPDATE ON employee_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_employee_schedules_updated_at();
