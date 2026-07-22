-- =====================================================
-- BABYSITTER ROLE + AVAILABILITY COORDINATION
-- 1) Babysitter employee group
-- 2) Babysitters can view child logs only during their shifts
-- 3) Availability: weekly default template + per-week entries
-- 4) Booking requests (admin asks, babysitter accepts/declines)
-- Idempotent: safe to run more than once.
-- =====================================================

-- 1) Babysitter group (idempotent)
INSERT INTO employee_groups (name, description)
SELECT 'Babysitter', 'Babysitters: can view the menu, their own schedule, and the children''s schedule during their shifts'
WHERE NOT EXISTS (
    SELECT 1 FROM employee_groups WHERE LOWER(name) IN ('babysitter', 'babysitters')
);

-- 2) Helper: is the current user a babysitter?
CREATE OR REPLACE FUNCTION is_babysitter()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM employee_group_memberships egm
    JOIN employee_groups eg ON egm.group_id = eg.id
    WHERE egm.user_id = auth.uid()
    AND LOWER(eg.name) IN ('babysitter', 'babysitters')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: does a child log overlap one of the current user's shifts?
-- Shifts come from recurring employee_schedules (with overrides applied)
-- and schedule_one_offs. Checks the log's date and the previous day so
-- overnight shifts (end_time <= start_time) are handled.
CREATE OR REPLACE FUNCTION child_log_in_my_shift(
    p_log_date DATE,
    p_log_time TIME,
    p_start TIME,
    p_end TIME
)
RETURNS BOOLEAN AS $$
DECLARE
  v_log_start TIMESTAMP;
  v_log_end TIMESTAMP;
BEGIN
  v_log_start := p_log_date + COALESCE(p_start, p_log_time);
  IF p_start IS NOT NULL AND p_end IS NOT NULL THEN
    -- An end at/before the start means the log runs overnight (e.g. sleep)
    v_log_end := p_log_date + p_end
      + (CASE WHEN p_end <= p_start THEN INTERVAL '1 day' ELSE INTERVAL '0' END);
  ELSE
    v_log_end := v_log_start;
  END IF;

  RETURN EXISTS (
    WITH shift_windows AS (
      SELECT d.day AS shift_date,
             COALESCE(so.start_time, es.start_time) AS start_time,
             COALESCE(so.end_time, es.end_time) AS end_time
      FROM (VALUES (p_log_date), (p_log_date - 1)) AS d(day)
      JOIN employee_schedules es
        ON es.user_id = auth.uid()
       AND es.is_active
       AND es.day_of_week = EXTRACT(DOW FROM d.day)::int
      LEFT JOIN schedule_overrides so
        ON so.schedule_id = es.id AND so.override_date = d.day
      WHERE COALESCE(so.is_cancelled, FALSE) = FALSE
      UNION ALL
      SELECT o.schedule_date, o.start_time, o.end_time
      FROM schedule_one_offs o
      WHERE o.user_id = auth.uid()
        AND o.schedule_date IN (p_log_date, p_log_date - 1)
    )
    SELECT 1 FROM shift_windows sw
    WHERE (sw.shift_date + sw.start_time) <= v_log_end
      AND (sw.shift_date + sw.end_time
           + (CASE WHEN sw.end_time <= sw.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END)
          ) >= v_log_start
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Babysitters may view child logs only while they are scheduled
DROP POLICY IF EXISTS "Babysitters can view child logs during their shifts" ON child_logs;
CREATE POLICY "Babysitters can view child logs during their shifts"
    ON child_logs FOR SELECT
    USING (is_babysitter() AND child_log_in_my_shift(log_date, log_time, start_time, end_time));

-- =====================================================
-- 3) AVAILABILITY
-- =====================================================

-- Default weekly pattern (multiple ranges per day allowed)
CREATE TABLE IF NOT EXISTS babysitter_availability_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_bs_avail_templates_user ON babysitter_availability_templates(user_id);

-- Marks a specific week as confirmed/customized by the babysitter.
-- If a row exists for (user, week), that week's entries are authoritative;
-- otherwise the template is the best guess.
CREATE TABLE IF NOT EXISTS babysitter_availability_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL, -- Sunday
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_bs_avail_weeks_user ON babysitter_availability_weeks(user_id, week_start);

-- Concrete availability for specific dates (belonging to a confirmed week)
CREATE TABLE IF NOT EXISTS babysitter_availability_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_bs_avail_entries_user_date ON babysitter_availability_entries(user_id, entry_date);

ALTER TABLE babysitter_availability_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE babysitter_availability_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE babysitter_availability_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own availability template" ON babysitter_availability_templates;
CREATE POLICY "Users manage own availability template"
    ON babysitter_availability_templates FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all availability templates" ON babysitter_availability_templates;
CREATE POLICY "Admins can view all availability templates"
    ON babysitter_availability_templates FOR SELECT
    USING (is_admin());

DROP POLICY IF EXISTS "Users manage own availability weeks" ON babysitter_availability_weeks;
CREATE POLICY "Users manage own availability weeks"
    ON babysitter_availability_weeks FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all availability weeks" ON babysitter_availability_weeks;
CREATE POLICY "Admins can view all availability weeks"
    ON babysitter_availability_weeks FOR SELECT
    USING (is_admin());

DROP POLICY IF EXISTS "Users manage own availability entries" ON babysitter_availability_entries;
CREATE POLICY "Users manage own availability entries"
    ON babysitter_availability_entries FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all availability entries" ON babysitter_availability_entries;
CREATE POLICY "Admins can view all availability entries"
    ON babysitter_availability_entries FOR SELECT
    USING (is_admin());

DROP TRIGGER IF EXISTS update_bs_avail_templates_updated_at ON babysitter_availability_templates;
CREATE TRIGGER update_bs_avail_templates_updated_at
    BEFORE UPDATE ON babysitter_availability_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bs_avail_weeks_updated_at ON babysitter_availability_weeks;
CREATE TRIGGER update_bs_avail_weeks_updated_at
    BEFORE UPDATE ON babysitter_availability_weeks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4) BOOKING REQUESTS
-- =====================================================

CREATE TABLE IF NOT EXISTS babysitter_booking_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    babysitter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    -- The shift created on acceptance
    one_off_id UUID REFERENCES schedule_one_offs(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bs_booking_requests_sitter ON babysitter_booking_requests(babysitter_id, status);
CREATE INDEX IF NOT EXISTS idx_bs_booking_requests_date ON babysitter_booking_requests(request_date);

ALTER TABLE babysitter_booking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage all booking requests" ON babysitter_booking_requests;
CREATE POLICY "Admins manage all booking requests"
    ON babysitter_booking_requests FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Babysitters can view own booking requests" ON babysitter_booking_requests;
CREATE POLICY "Babysitters can view own booking requests"
    ON babysitter_booking_requests FOR SELECT
    USING (babysitter_id = auth.uid());

-- Accept/decline goes through the API (service role), which enforces
-- that only the babysitter herself can respond to a pending request.

DROP TRIGGER IF EXISTS update_bs_booking_requests_updated_at ON babysitter_booking_requests;
CREATE TRIGGER update_bs_booking_requests_updated_at
    BEFORE UPDATE ON babysitter_booking_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
