-- Per-user event archival (not global archived flag)
-- Users can archive events from their view without affecting other users

CREATE TABLE event_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  archived_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX idx_event_archives_user ON event_archives(user_id);
CREATE INDEX idx_event_archives_event ON event_archives(event_id);

-- Enable RLS on event_archives
ALTER TABLE event_archives ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only manage their own event archives
CREATE POLICY "users_can_manage_own_event_archives" ON event_archives
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy to events to allow users to manage their own archives (via the new table)
CREATE POLICY "Authenticated users can update events"
  ON events FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Add new RLS policy on events to filter archived-by-current-user events
-- This policy allows users to see events they haven't archived
CREATE POLICY "users_see_non_archived_events" ON events
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND NOT EXISTS (
      SELECT 1 FROM event_archives
      WHERE user_id = auth.uid() AND event_id = events.id
    )
  );
