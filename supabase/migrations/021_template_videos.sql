-- Template videos table for storing video links and uploads attached to task templates
CREATE TABLE template_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
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
CREATE INDEX idx_template_videos_template_id ON template_videos(template_id);

-- Enable RLS
ALTER TABLE template_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only admins can manage template videos (templates are admin-only)
CREATE POLICY "Admins can manage template videos"
    ON template_videos FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Employees can view template videos (for templates used in their assigned tasks)
CREATE POLICY "Employees can view template videos"
    ON template_videos FOR SELECT
    TO authenticated
    USING (true);
