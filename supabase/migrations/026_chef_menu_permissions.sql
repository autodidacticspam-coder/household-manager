-- =====================================================
-- CHEF MENU PERMISSIONS
-- Give chef group the same menu privileges as admins
-- =====================================================

-- Create function to check if user is admin or chef
CREATE OR REPLACE FUNCTION is_admin_or_chef()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is admin
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if user is in Chef group
  RETURN EXISTS (
    SELECT 1 FROM employee_group_memberships egm
    JOIN employee_groups eg ON egm.group_id = eg.id
    WHERE egm.user_id = auth.uid()
    AND LOWER(eg.name) = 'chef'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- UPDATE WEEKLY_MENU POLICIES
-- =====================================================

-- Drop existing admin-only policy
DROP POLICY IF EXISTS "Admins can manage weekly menu" ON weekly_menu;

-- Create new policy for admins and chefs
CREATE POLICY "Admins and chefs can manage weekly menu"
    ON weekly_menu FOR ALL
    USING (is_admin_or_chef())
    WITH CHECK (is_admin_or_chef());

-- =====================================================
-- UPDATE MENU_ITEMS POLICIES
-- =====================================================

-- Drop existing admin-only policy
DROP POLICY IF EXISTS "Admins can manage menu items" ON menu_items;

-- Create new policy for admins and chefs
CREATE POLICY "Admins and chefs can manage menu items"
    ON menu_items FOR ALL
    USING (is_admin_or_chef())
    WITH CHECK (is_admin_or_chef());

-- =====================================================
-- UPDATE MENU_RATINGS POLICIES
-- Allow chefs to also rate menu items
-- =====================================================

-- Drop existing admin-only policies
DROP POLICY IF EXISTS "Admins can insert own ratings" ON menu_ratings;
DROP POLICY IF EXISTS "Admins can update own ratings" ON menu_ratings;
DROP POLICY IF EXISTS "Admins can delete own ratings" ON menu_ratings;

-- Create new policies for admins and chefs
CREATE POLICY "Admins and chefs can insert own ratings"
    ON menu_ratings FOR INSERT
    WITH CHECK (is_admin_or_chef() AND rated_by = auth.uid());

CREATE POLICY "Admins and chefs can update own ratings"
    ON menu_ratings FOR UPDATE
    USING (is_admin_or_chef() AND rated_by = auth.uid())
    WITH CHECK (is_admin_or_chef() AND rated_by = auth.uid());

CREATE POLICY "Admins and chefs can delete own ratings"
    ON menu_ratings FOR DELETE
    USING (is_admin_or_chef() AND rated_by = auth.uid());
