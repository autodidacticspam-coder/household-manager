-- =====================================================
-- WEEKLY MENU TABLE
-- For storing weekly meal plans editable by admins
-- =====================================================

CREATE TABLE weekly_menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL DEFAULT date_trunc('week', CURRENT_DATE)::date,
    meals JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(week_start)
);

-- Create trigger for updated_at
CREATE TRIGGER update_weekly_menu_updated_at
    BEFORE UPDATE ON weekly_menu
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index for week lookup
CREATE INDEX idx_weekly_menu_week_start ON weekly_menu(week_start);

-- RLS Policies
ALTER TABLE weekly_menu ENABLE ROW LEVEL SECURITY;

-- Everyone can view the menu
CREATE POLICY "Everyone can view weekly menu"
    ON weekly_menu FOR SELECT
    USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage weekly menu"
    ON weekly_menu FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Insert a default empty menu for the current week
INSERT INTO weekly_menu (week_start, meals, notes)
VALUES (
    date_trunc('week', CURRENT_DATE)::date,
    '[
        {"day": "Monday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""},
        {"day": "Tuesday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""},
        {"day": "Wednesday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""},
        {"day": "Thursday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""},
        {"day": "Friday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""},
        {"day": "Saturday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""},
        {"day": "Sunday", "breakfast": "", "lunch": "", "dinner": "", "snacks": ""}
    ]'::jsonb,
    NULL
);
