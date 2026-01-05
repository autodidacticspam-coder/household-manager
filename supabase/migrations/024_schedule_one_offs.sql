-- Create table for one-time schedule entries (not recurring)
CREATE TABLE IF NOT EXISTS schedule_one_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Prevent duplicate one-off schedules for same user on same date
  UNIQUE(user_id, schedule_date)
);

-- Add RLS policies
ALTER TABLE schedule_one_offs ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all one-off schedules"
  ON schedule_one_offs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Employees can view their own one-off schedules
CREATE POLICY "Employees can view own one-off schedules"
  ON schedule_one_offs FOR SELECT
  USING (user_id = auth.uid());

-- Create index for efficient date-based queries
CREATE INDEX idx_schedule_one_offs_date ON schedule_one_offs(schedule_date);
CREATE INDEX idx_schedule_one_offs_user_date ON schedule_one_offs(user_id, schedule_date);
