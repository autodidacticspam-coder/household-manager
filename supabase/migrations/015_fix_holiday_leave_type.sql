-- =====================================================
-- FIX HOLIDAY LEAVE TYPE
-- Adds 'holiday' to leave_type enum and updates leave requests
-- where reason starts with "Holiday:" to use the new type
-- =====================================================

-- Add 'holiday' to the leave_type enum if it doesn't exist
DO $$
BEGIN
    -- Check if 'holiday' already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'holiday'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'leave_type')
    ) THEN
        ALTER TYPE leave_type ADD VALUE 'holiday';
    END IF;
END
$$;

-- Update existing PTO leave requests that are actually holidays
UPDATE leave_requests
SET leave_type = 'holiday'
WHERE leave_type = 'pto'
  AND reason LIKE 'Holiday:%';
