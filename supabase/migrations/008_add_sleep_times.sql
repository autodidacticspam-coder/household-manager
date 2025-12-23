-- =====================================================
-- ADD START/END TIME TO CHILD LOGS
-- For tracking sleep duration (start and end times)
-- =====================================================

-- Add columns if they don't exist
DO $$
BEGIN
    -- Add start_time column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'child_logs' AND column_name = 'start_time'
    ) THEN
        ALTER TABLE child_logs ADD COLUMN start_time TIME;
    END IF;

    -- Add end_time column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'child_logs' AND column_name = 'end_time'
    ) THEN
        ALTER TABLE child_logs ADD COLUMN end_time TIME;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN child_logs.start_time IS 'For sleep logs: when sleep started';
COMMENT ON COLUMN child_logs.end_time IS 'For sleep logs: when sleep ended';
