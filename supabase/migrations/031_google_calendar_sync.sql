-- Add sync_filters and google_email columns to google_calendar_tokens table

-- Add sync_filters column with default filters
ALTER TABLE google_calendar_tokens
ADD COLUMN IF NOT EXISTS sync_filters JSONB DEFAULT '{
  "tasks": true,
  "leave": true,
  "schedules": true,
  "importantDates": true,
  "childLogs": {
    "sleep": true,
    "food": true,
    "poop": true,
    "shower": true
  }
}'::jsonb;

-- Add google_email column to store the connected Google account email
ALTER TABLE google_calendar_tokens
ADD COLUMN IF NOT EXISTS google_email TEXT;

-- Add last_synced column to track when events were last synced
ALTER TABLE google_calendar_tokens
ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Create table to track synced events (for updating/deleting)
CREATE TABLE IF NOT EXISTS google_calendar_synced_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'task', 'leave', 'schedule', 'important_date', 'child_log'
    source_id TEXT NOT NULL, -- ID of the source record in our database
    google_event_id TEXT NOT NULL, -- Google Calendar event ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_type, source_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_synced_events_lookup
ON google_calendar_synced_events(user_id, event_type, source_id);

CREATE INDEX IF NOT EXISTS idx_synced_events_google_id
ON google_calendar_synced_events(user_id, google_event_id);

-- Add RLS policies for synced events table
ALTER TABLE google_calendar_synced_events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own synced events
CREATE POLICY "Users can view own synced events"
    ON google_calendar_synced_events FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own synced events
CREATE POLICY "Users can insert own synced events"
    ON google_calendar_synced_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own synced events
CREATE POLICY "Users can update own synced events"
    ON google_calendar_synced_events FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own synced events
CREATE POLICY "Users can delete own synced events"
    ON google_calendar_synced_events FOR DELETE
    USING (auth.uid() = user_id);

-- Add updated_at trigger for synced events
CREATE OR REPLACE FUNCTION update_google_synced_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_google_calendar_synced_events_updated_at ON google_calendar_synced_events;
CREATE TRIGGER update_google_calendar_synced_events_updated_at
    BEFORE UPDATE ON google_calendar_synced_events
    FOR EACH ROW
    EXECUTE FUNCTION update_google_synced_events_updated_at();
