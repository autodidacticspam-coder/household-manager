-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USERS POLICIES
-- =====================================================

-- Admins can view all users
CREATE POLICY "Admins can view all users"
    ON users FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view their own profile
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Employees can view basic info of other employees (for task assignments display)
CREATE POLICY "Employees can view other employee names"
    ON users FOR SELECT
    TO authenticated
    USING (TRUE);

-- Admins can insert new users
CREATE POLICY "Admins can insert users"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update any user
CREATE POLICY "Admins can update any user"
    ON users FOR UPDATE
    TO authenticated
    USING (is_admin());

-- Users can update their own basic profile fields
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND
        -- Employees cannot change their own role
        (is_admin() OR role = (SELECT role FROM users WHERE id = auth.uid()))
    );

-- Admins can delete users
CREATE POLICY "Admins can delete users"
    ON users FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- EMPLOYEE GROUPS POLICIES
-- =====================================================

-- Everyone can view groups
CREATE POLICY "Everyone can view groups"
    ON employee_groups FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins can manage groups
CREATE POLICY "Admins can insert groups"
    ON employee_groups FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "Admins can update groups"
    ON employee_groups FOR UPDATE
    TO authenticated
    USING (is_admin());

CREATE POLICY "Admins can delete groups"
    ON employee_groups FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- EMPLOYEE GROUP MEMBERSHIPS POLICIES
-- =====================================================

-- Everyone can view memberships
CREATE POLICY "Everyone can view group memberships"
    ON employee_group_memberships FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins can manage memberships
CREATE POLICY "Admins can insert group memberships"
    ON employee_group_memberships FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "Admins can delete group memberships"
    ON employee_group_memberships FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- EMPLOYEE PROFILES POLICIES
-- =====================================================

-- Admins can view all profiles
CREATE POLICY "Admins can view all employee profiles"
    ON employee_profiles FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view their own profile
CREATE POLICY "Employees can view own profile"
    ON employee_profiles FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can insert profiles
CREATE POLICY "Admins can insert employee profiles"
    ON employee_profiles FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update any profile
CREATE POLICY "Admins can update any employee profile"
    ON employee_profiles FOR UPDATE
    TO authenticated
    USING (is_admin());

-- Employees can update their own profile
CREATE POLICY "Employees can update own profile"
    ON employee_profiles FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can delete profiles
CREATE POLICY "Admins can delete employee profiles"
    ON employee_profiles FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- TASK CATEGORIES POLICIES
-- =====================================================

-- Everyone can view categories
CREATE POLICY "Everyone can view task categories"
    ON task_categories FOR SELECT
    TO authenticated
    USING (TRUE);

-- Only admins can manage categories
CREATE POLICY "Admins can insert task categories"
    ON task_categories FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "Admins can update task categories"
    ON task_categories FOR UPDATE
    TO authenticated
    USING (is_admin());

CREATE POLICY "Admins can delete task categories"
    ON task_categories FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- TASKS POLICIES
-- =====================================================

-- Admins can view all tasks
CREATE POLICY "Admins can view all tasks"
    ON tasks FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view tasks assigned to them
CREATE POLICY "Employees can view assigned tasks"
    ON tasks FOR SELECT
    TO authenticated
    USING (is_assigned_to_task(id));

-- Admins can create tasks
CREATE POLICY "Admins can create tasks"
    ON tasks FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update any task
CREATE POLICY "Admins can update any task"
    ON tasks FOR UPDATE
    TO authenticated
    USING (is_admin());

-- Employees can update status of assigned tasks (mark complete)
CREATE POLICY "Employees can update assigned task status"
    ON tasks FOR UPDATE
    TO authenticated
    USING (is_assigned_to_task(id))
    WITH CHECK (
        -- Only allow updating status and completed fields
        is_assigned_to_task(id)
    );

-- Admins can delete tasks
CREATE POLICY "Admins can delete tasks"
    ON tasks FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- TASK ASSIGNMENTS POLICIES
-- =====================================================

-- Admins can view all assignments
CREATE POLICY "Admins can view all task assignments"
    ON task_assignments FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view assignments for their tasks
CREATE POLICY "Employees can view own task assignments"
    ON task_assignments FOR SELECT
    TO authenticated
    USING (
        target_type = 'all' OR
        target_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM employee_group_memberships
            WHERE group_id = target_group_id AND user_id = auth.uid()
        )
    );

-- Only admins can manage assignments
CREATE POLICY "Admins can insert task assignments"
    ON task_assignments FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "Admins can update task assignments"
    ON task_assignments FOR UPDATE
    TO authenticated
    USING (is_admin());

CREATE POLICY "Admins can delete task assignments"
    ON task_assignments FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- TASK INSTANCES POLICIES
-- =====================================================

-- Admins can view all instances
CREATE POLICY "Admins can view all task instances"
    ON task_instances FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view instances of assigned tasks
CREATE POLICY "Employees can view assigned task instances"
    ON task_instances FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.id = parent_task_id AND is_assigned_to_task(t.id)
        )
    );

-- Admins can create instances
CREATE POLICY "Admins can insert task instances"
    ON task_instances FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update any instance
CREATE POLICY "Admins can update any task instance"
    ON task_instances FOR UPDATE
    TO authenticated
    USING (is_admin());

-- Employees can update instances of assigned tasks
CREATE POLICY "Employees can update assigned task instances"
    ON task_instances FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.id = parent_task_id AND is_assigned_to_task(t.id)
        )
    );

-- Admins can delete instances
CREATE POLICY "Admins can delete task instances"
    ON task_instances FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- LEAVE REQUESTS POLICIES
-- =====================================================

-- Admins can view all leave requests
CREATE POLICY "Admins can view all leave requests"
    ON leave_requests FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view their own requests
CREATE POLICY "Employees can view own leave requests"
    ON leave_requests FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Employees can create their own requests
CREATE POLICY "Employees can create own leave requests"
    ON leave_requests FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Admins can update any request (approve/deny)
CREATE POLICY "Admins can update any leave request"
    ON leave_requests FOR UPDATE
    TO authenticated
    USING (is_admin());

-- Employees can update their pending requests (cancel/modify)
CREATE POLICY "Employees can update own pending requests"
    ON leave_requests FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() AND status = 'pending')
    WITH CHECK (user_id = auth.uid());

-- Admins can delete leave requests
CREATE POLICY "Admins can delete leave requests"
    ON leave_requests FOR DELETE
    TO authenticated
    USING (is_admin());

-- Employees can delete their pending requests
CREATE POLICY "Employees can delete own pending requests"
    ON leave_requests FOR DELETE
    TO authenticated
    USING (user_id = auth.uid() AND status = 'pending');

-- =====================================================
-- LEAVE BALANCES POLICIES
-- =====================================================

-- Admins can view all balances
CREATE POLICY "Admins can view all leave balances"
    ON leave_balances FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view their own balances
CREATE POLICY "Employees can view own leave balance"
    ON leave_balances FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Only admins can manage balances
CREATE POLICY "Admins can insert leave balances"
    ON leave_balances FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "Admins can update leave balances"
    ON leave_balances FOR UPDATE
    TO authenticated
    USING (is_admin());

CREATE POLICY "Admins can delete leave balances"
    ON leave_balances FOR DELETE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- ATTACHMENTS POLICIES
-- =====================================================

-- Admins can view all attachments
CREATE POLICY "Admins can view all attachments"
    ON attachments FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view attachments on their tasks or profiles
CREATE POLICY "Employees can view relevant attachments"
    ON attachments FOR SELECT
    TO authenticated
    USING (
        (attachable_type = 'employee_profile' AND EXISTS (
            SELECT 1 FROM employee_profiles ep WHERE ep.id = attachable_id AND ep.user_id = auth.uid()
        )) OR
        (attachable_type = 'task' AND EXISTS (
            SELECT 1 FROM tasks t WHERE t.id = attachable_id AND is_assigned_to_task(t.id)
        ))
    );

-- Admins can insert attachments anywhere
CREATE POLICY "Admins can insert attachments"
    ON attachments FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Employees can add attachments to their profile
CREATE POLICY "Employees can insert own profile attachments"
    ON attachments FOR INSERT
    TO authenticated
    WITH CHECK (
        attachable_type = 'employee_profile' AND EXISTS (
            SELECT 1 FROM employee_profiles ep WHERE ep.id = attachable_id AND ep.user_id = auth.uid()
        )
    );

-- Admins can delete any attachment
CREATE POLICY "Admins can delete attachments"
    ON attachments FOR DELETE
    TO authenticated
    USING (is_admin());

-- Employees can delete their own attachments
CREATE POLICY "Employees can delete own attachments"
    ON attachments FOR DELETE
    TO authenticated
    USING (uploaded_by = auth.uid());

-- =====================================================
-- SMS NOTIFICATIONS POLICIES
-- =====================================================

-- Admins can view all notifications
CREATE POLICY "Admins can view all sms notifications"
    ON sms_notifications FOR SELECT
    TO authenticated
    USING (is_admin());

-- Employees can view their own notifications
CREATE POLICY "Employees can view own sms notifications"
    ON sms_notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Only system/admins should insert (usually via service role)
CREATE POLICY "Admins can insert sms notifications"
    ON sms_notifications FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

-- Admins can update notifications
CREATE POLICY "Admins can update sms notifications"
    ON sms_notifications FOR UPDATE
    TO authenticated
    USING (is_admin());

-- =====================================================
-- GOOGLE CALENDAR TOKENS POLICIES
-- =====================================================

-- Users can only see their own tokens
CREATE POLICY "Users can view own google calendar tokens"
    ON google_calendar_tokens FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can insert their own tokens
CREATE POLICY "Users can insert own google calendar tokens"
    ON google_calendar_tokens FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can update their own tokens
CREATE POLICY "Users can update own google calendar tokens"
    ON google_calendar_tokens FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- Users can delete their own tokens
CREATE POLICY "Users can delete own google calendar tokens"
    ON google_calendar_tokens FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can view all tokens (for debugging)
CREATE POLICY "Admins can view all google calendar tokens"
    ON google_calendar_tokens FOR SELECT
    TO authenticated
    USING (is_admin());
