-- =====================================================
-- ADD SELECTED DATES TO LEAVE REQUESTS
-- Stores individual selected dates for non-contiguous leave
-- =====================================================

ALTER TABLE leave_requests
ADD COLUMN selected_dates DATE[] DEFAULT NULL;

-- Update existing records to populate selected_dates from start_date/end_date range
-- This is just for backward compatibility with existing data
UPDATE leave_requests
SET selected_dates = ARRAY(
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date
)
WHERE selected_dates IS NULL;
