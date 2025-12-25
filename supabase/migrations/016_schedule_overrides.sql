-- =====================================================
-- SCHEDULE OVERRIDES
-- One-time modifications to recurring work schedules
-- =====================================================

CREATE TABLE IF NOT EXISTS schedule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES employee_schedules(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    -- NULL start/end times means the shift is cancelled for this date
    start_time TIME,
    end_time TIME,
    is_cancelled BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure only one override per schedule per date
    CONSTRAINT unique_schedule_override UNIQUE (schedule_id, override_date),
    -- If not cancelled, times must be valid
    CONSTRAINT valid_override_times CHECK (
        is_cancelled = TRUE OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

-- Index for efficient queries by date
CREATE INDEX idx_schedule_overrides_date ON schedule_overrides(override_date);

-- Index for efficient queries by schedule
CREATE INDEX idx_schedule_overrides_schedule_id ON schedule_overrides(schedule_id);

-- Enable RLS
ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Admins can manage all overrides
CREATE POLICY "Admins can manage all schedule overrides" ON schedule_overrides
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
    );

-- Employees can view overrides for their own schedules
CREATE POLICY "Employees can view own schedule overrides" ON schedule_overrides
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM employee_schedules
            WHERE employee_schedules.id = schedule_overrides.schedule_id
            AND employee_schedules.user_id = auth.uid()
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_schedule_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schedule_overrides_updated_at
    BEFORE UPDATE ON schedule_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_schedule_overrides_updated_at();
