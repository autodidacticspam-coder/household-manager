-- Task videos table for storing video links and uploads
CREATE TABLE task_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    video_type TEXT NOT NULL CHECK (video_type IN ('upload', 'link')),
    url TEXT NOT NULL,
    title TEXT,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create index for faster lookups
CREATE INDEX idx_task_videos_task_id ON task_videos(task_id);

-- Enable RLS
ALTER TABLE task_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can do everything
CREATE POLICY "Admins can manage task videos"
    ON task_videos FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Employees can view videos for tasks they're assigned to or are viewers of
CREATE POLICY "Employees can view task videos"
    ON task_videos FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.id = task_videos.task_id
            AND (
                -- Assigned to user
                EXISTS (
                    SELECT 1 FROM task_assignments ta
                    WHERE ta.task_id = t.id
                    AND (
                        ta.target_user_id = auth.uid()
                        OR (ta.target_type = 'all')
                        OR (ta.target_type = 'group' AND EXISTS (
                            SELECT 1 FROM employee_group_memberships egm
                            WHERE egm.user_id = auth.uid()
                            AND egm.group_id = ta.target_group_id
                        ))
                    )
                )
                -- Or is a viewer
                OR EXISTS (
                    SELECT 1 FROM task_viewers tv
                    WHERE tv.task_id = t.id
                    AND (
                        tv.target_user_id = auth.uid()
                        OR (tv.target_type = 'all')
                        OR (tv.target_type = 'group' AND EXISTS (
                            SELECT 1 FROM employee_group_memberships egm
                            WHERE egm.user_id = auth.uid()
                            AND egm.group_id = tv.target_group_id
                        ))
                    )
                )
            )
        )
    );

-- Create storage bucket for task videos (run this in Supabase dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('task-videos', 'task-videos', true);
