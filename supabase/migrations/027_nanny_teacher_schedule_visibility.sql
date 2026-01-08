-- =====================================================
-- NANNY/TEACHER SCHEDULE VISIBILITY
-- Allow nannies and teachers to see each other's schedules
-- =====================================================

-- Policy for Nannies and Teachers to view each other's schedules
CREATE POLICY "Nannies and Teachers can view each others schedules"
    ON employee_schedules FOR SELECT
    USING (
        -- User is in Nanny or Teacher group
        EXISTS (
            SELECT 1 FROM employee_group_memberships egm
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE egm.user_id = auth.uid()
            AND LOWER(eg.name) IN ('nanny', 'teacher')
        )
        AND
        -- The schedule belongs to someone in Nanny or Teacher group
        EXISTS (
            SELECT 1 FROM employee_group_memberships egm
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE egm.user_id = employee_schedules.user_id
            AND LOWER(eg.name) IN ('nanny', 'teacher')
        )
    );

-- Also allow viewing one-off schedules
CREATE POLICY "Nannies and Teachers can view each others one-off schedules"
    ON schedule_one_offs FOR SELECT
    USING (
        -- User is in Nanny or Teacher group
        EXISTS (
            SELECT 1 FROM employee_group_memberships egm
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE egm.user_id = auth.uid()
            AND LOWER(eg.name) IN ('nanny', 'teacher')
        )
        AND
        -- The schedule belongs to someone in Nanny or Teacher group
        EXISTS (
            SELECT 1 FROM employee_group_memberships egm
            JOIN employee_groups eg ON egm.group_id = eg.id
            WHERE egm.user_id = schedule_one_offs.user_id
            AND LOWER(eg.name) IN ('nanny', 'teacher')
        )
    );
