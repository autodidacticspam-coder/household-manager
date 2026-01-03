-- =====================================================
-- RENAME PTO TO VACATION
-- Updates enum value and column names from 'pto' to 'vacation'
-- =====================================================

-- Step 1: Add 'vacation' to the leave_type enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'vacation'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'leave_type')
    ) THEN
        ALTER TYPE leave_type ADD VALUE 'vacation';
    END IF;
END
$$;

-- Step 2: Update all leave_requests that use 'pto' to use 'vacation'
UPDATE leave_requests
SET leave_type = 'vacation'
WHERE leave_type = 'pto';

-- Step 3: Rename columns in leave_balances table
ALTER TABLE leave_balances
    RENAME COLUMN pto_total TO vacation_total;

ALTER TABLE leave_balances
    RENAME COLUMN pto_used TO vacation_used;

-- Note: We cannot remove 'pto' from the enum in PostgreSQL without recreating it,
-- but since no data uses it anymore, it's harmless to leave it.
-- The application code now uses 'vacation' exclusively.
