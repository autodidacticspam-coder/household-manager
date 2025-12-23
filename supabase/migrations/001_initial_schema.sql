-- =====================================================
-- HOUSEHOLD MANAGER DATABASE SCHEMA
-- =====================================================

-- ENUMS
CREATE TYPE user_role AS ENUM ('admin', 'employee');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed');
CREATE TYPE leave_type AS ENUM ('pto', 'sick');
CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE assignment_target_type AS ENUM ('user', 'group', 'all');
CREATE TYPE attachable_type AS ENUM ('task', 'employee_profile');
CREATE TYPE notification_type AS ENUM (
    'task_assigned',
    'task_due_reminder',
    'leave_request_submitted',
    'leave_request_approved',
    'leave_request_denied',
    'schedule_change'
);
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

-- =====================================================
-- USERS TABLE (extends Supabase Auth)
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    avatar_url TEXT,
    phone TEXT,
    sms_notifications_enabled BOOLEAN DEFAULT TRUE,
    preferred_locale TEXT DEFAULT 'en' CHECK (preferred_locale IN ('en', 'es', 'zh')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EMPLOYEE GROUPS (e.g., "Nannies", "Housekeepers")
-- =====================================================
CREATE TABLE employee_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EMPLOYEE GROUP MEMBERSHIPS
-- =====================================================
CREATE TABLE employee_group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES employee_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, group_id)
);

-- =====================================================
-- EMPLOYEE PROFILES (extended metadata)
-- =====================================================
CREATE TABLE employee_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    date_of_birth DATE,
    hire_date DATE,
    phone TEXT,
    emergency_contact TEXT,
    notes TEXT,
    -- Important dates stored as JSONB for flexibility
    -- Example: [{"label": "Child's Birthday", "date": "2020-05-15"}]
    important_dates JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TASK CATEGORIES (e.g., "Organizing", "Childcare")
-- =====================================================
CREATE TABLE task_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TASKS (Master task list)
-- =====================================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES task_categories(id) ON DELETE SET NULL,
    priority task_priority DEFAULT 'medium',
    status task_status DEFAULT 'pending',

    -- Scheduling
    due_date DATE,
    due_time TIME,
    is_all_day BOOLEAN DEFAULT TRUE,

    -- Recurrence (optional)
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT, -- iCal RRULE format

    -- External sync
    google_calendar_event_id TEXT,
    sync_to_calendar BOOLEAN DEFAULT FALSE,

    -- Audit
    created_by UUID REFERENCES users(id),
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TASK ASSIGNMENTS (supports user, group, or all)
-- =====================================================
CREATE TABLE task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    target_type assignment_target_type NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_group_id UUID REFERENCES employee_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_assignment CHECK (
        (target_type = 'user' AND target_user_id IS NOT NULL AND target_group_id IS NULL) OR
        (target_type = 'group' AND target_group_id IS NOT NULL AND target_user_id IS NULL) OR
        (target_type = 'all' AND target_user_id IS NULL AND target_group_id IS NULL)
    )
);

-- =====================================================
-- TASK INSTANCES (for recurring tasks)
-- =====================================================
CREATE TABLE task_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    instance_date DATE NOT NULL,
    status task_status DEFAULT 'pending',
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    title_override TEXT,
    description_override TEXT,
    google_calendar_event_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_task_id, instance_date)
);

-- =====================================================
-- LEAVE REQUESTS
-- =====================================================
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    leave_type leave_type NOT NULL,
    status leave_status DEFAULT 'pending',

    -- Date/Time range
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_full_day BOOLEAN DEFAULT TRUE,
    start_time TIME,
    end_time TIME,

    -- Calculated field
    total_days DECIMAL(4,2),

    reason TEXT,
    admin_notes TEXT,

    -- Audit
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- LEAVE BALANCES (Track PTO/Sick balances per year)
-- =====================================================
CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    pto_total DECIMAL(4,2) DEFAULT 15,
    pto_used DECIMAL(4,2) DEFAULT 0,
    sick_total DECIMAL(4,2) DEFAULT 10,
    sick_used DECIMAL(4,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year)
);

-- =====================================================
-- ATTACHMENTS (polymorphic)
-- =====================================================
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachable_type attachable_type NOT NULL,
    attachable_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SMS NOTIFICATIONS LOG
-- =====================================================
CREATE TABLE sms_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    notification_type notification_type NOT NULL,
    message TEXT NOT NULL,
    status notification_status DEFAULT 'pending',
    twilio_sid TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GOOGLE CALENDAR TOKENS
-- =====================================================
CREATE TABLE google_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ NOT NULL,
    calendar_id TEXT DEFAULT 'primary',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES for performance
-- =====================================================
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_tasks_category ON tasks(category_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);

CREATE INDEX idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX idx_task_assignments_user ON task_assignments(target_user_id);
CREATE INDEX idx_task_assignments_group ON task_assignments(target_group_id);

CREATE INDEX idx_task_instances_parent ON task_instances(parent_task_id);
CREATE INDEX idx_task_instances_date ON task_instances(instance_date);

CREATE INDEX idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);

CREATE INDEX idx_leave_balances_user_year ON leave_balances(user_id, year);

CREATE INDEX idx_attachments_target ON attachments(attachable_type, attachable_id);

CREATE INDEX idx_employee_group_memberships_user ON employee_group_memberships(user_id);
CREATE INDEX idx_employee_group_memberships_group ON employee_group_memberships(group_id);

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Default task categories
INSERT INTO task_categories (name, color, icon) VALUES
    ('Childcare', '#ec4899', 'baby'),
    ('Cleaning', '#3b82f6', 'spray-can'),
    ('Cooking', '#f97316', 'utensils'),
    ('Laundry', '#8b5cf6', 'shirt'),
    ('Organizing', '#10b981', 'folder'),
    ('Errands', '#eab308', 'car'),
    ('Pet Care', '#06b6d4', 'dog'),
    ('Other', '#6b7280', 'ellipsis');

-- Default employee groups
INSERT INTO employee_groups (name, description) VALUES
    ('Nannies', 'Childcare providers'),
    ('Housekeepers', 'Cleaning and household maintenance staff'),
    ('Personal Assistants', 'Administrative and personal support'),
    ('Drivers', 'Transportation staff');

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is assigned to task
CREATE OR REPLACE FUNCTION is_assigned_to_task(p_task_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM task_assignments ta
    LEFT JOIN employee_group_memberships egm
      ON ta.target_group_id = egm.group_id
    WHERE ta.task_id = p_task_id
    AND (
      ta.target_type = 'all'
      OR ta.target_user_id = auth.uid()
      OR egm.user_id = auth.uid()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_profiles_updated_at
    BEFORE UPDATE ON employee_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at
    BEFORE UPDATE ON leave_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_google_calendar_tokens_updated_at
    BEFORE UPDATE ON google_calendar_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
