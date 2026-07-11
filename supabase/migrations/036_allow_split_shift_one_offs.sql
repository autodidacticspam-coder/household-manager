-- ============================================================
-- ALLOW SPLIT SHIFTS FOR ONE-OFF SCHEDULES
-- The UNIQUE(user_id, schedule_date) constraint limited employees to a
-- single one-off shift per day, which made real split-shift schedules
-- (e.g. 6:00-11:00 AM and 2:00-7:00 PM on the same day) impossible to
-- enter from the calendar. Each shift is its own row with its own id;
-- calendar rendering and Google Calendar sync already handle multiple
-- rows per day, so the constraint serves no purpose.
-- ============================================================

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'schedule_one_offs'::regclass
    AND contype = 'u';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE schedule_one_offs DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
