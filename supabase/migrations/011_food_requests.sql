-- =====================================================
-- MENU ITEMS DATABASE
-- Stores all menu items for searchability
-- =====================================================

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT, -- breakfast, lunch, dinner, snacks
    times_served INTEGER DEFAULT 1,
    last_served_at DATE,
    average_rating DECIMAL(3, 1),
    total_ratings INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE TRIGGER update_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for efficient queries
CREATE INDEX idx_menu_items_name ON menu_items(name);
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_menu_items_average_rating ON menu_items(average_rating DESC);

-- RLS Policies
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Everyone can view menu items
CREATE POLICY "Everyone can view menu items"
    ON menu_items FOR SELECT
    USING (true);

-- Admins and chefs can manage menu items
CREATE POLICY "Admins can manage menu items"
    ON menu_items FOR ALL
    USING (is_admin());

-- =====================================================
-- FOOD REQUESTS
-- For admins to request specific foods from chef
-- =====================================================

CREATE TABLE food_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_name TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'declined')),
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE TRIGGER update_food_requests_updated_at
    BEFORE UPDATE ON food_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_food_requests_status ON food_requests(status);
CREATE INDEX idx_food_requests_requested_by ON food_requests(requested_by);
CREATE INDEX idx_food_requests_created_at ON food_requests(created_at DESC);

-- RLS Policies
ALTER TABLE food_requests ENABLE ROW LEVEL SECURITY;

-- Admins can create food requests
CREATE POLICY "Admins can create food requests"
    ON food_requests FOR INSERT
    WITH CHECK (is_admin() AND requested_by = auth.uid());

-- Everyone can view food requests (chef needs to see them)
CREATE POLICY "Everyone can view food requests"
    ON food_requests FOR SELECT
    USING (true);

-- Admins can update their own pending requests
CREATE POLICY "Admins can update own pending requests"
    ON food_requests FOR UPDATE
    USING (is_admin() AND (requested_by = auth.uid() OR status = 'pending'));

-- Allow chefs to update request status
CREATE POLICY "Chefs can update request status"
    ON food_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM employee_group_memberships egm
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE egm.user_id = auth.uid()
            AND LOWER(eg.name) = 'chef'
        )
    );

-- Admins can delete their own pending requests
CREATE POLICY "Admins can delete own pending requests"
    ON food_requests FOR DELETE
    USING (is_admin() AND requested_by = auth.uid() AND status = 'pending');
