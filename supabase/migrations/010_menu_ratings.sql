-- =====================================================
-- MENU ITEM RATINGS
-- For admins to rate individual menu items (1-10 scale)
-- =====================================================

CREATE TABLE menu_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL,
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks')),
    menu_item TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
    rated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(week_start, day_of_week, meal_type, menu_item, rated_by)
);

-- Create trigger for updated_at
CREATE TRIGGER update_menu_ratings_updated_at
    BEFORE UPDATE ON menu_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for efficient queries
CREATE INDEX idx_menu_ratings_week_start ON menu_ratings(week_start);
CREATE INDEX idx_menu_ratings_rated_by ON menu_ratings(rated_by);
CREATE INDEX idx_menu_ratings_menu_item ON menu_ratings(menu_item);

-- RLS Policies
ALTER TABLE menu_ratings ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own ratings
CREATE POLICY "Admins can insert own ratings"
    ON menu_ratings FOR INSERT
    WITH CHECK (is_admin() AND rated_by = auth.uid());

CREATE POLICY "Admins can update own ratings"
    ON menu_ratings FOR UPDATE
    USING (is_admin() AND rated_by = auth.uid())
    WITH CHECK (is_admin() AND rated_by = auth.uid());

CREATE POLICY "Admins can delete own ratings"
    ON menu_ratings FOR DELETE
    USING (is_admin() AND rated_by = auth.uid());

-- Everyone can view ratings (for chef to see aggregate data)
CREATE POLICY "Everyone can view menu ratings"
    ON menu_ratings FOR SELECT
    USING (true);
