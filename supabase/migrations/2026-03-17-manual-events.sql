-- Add columns to track manual vs extracted events and creator
ALTER TABLE events
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN source_type TEXT DEFAULT 'extracted';

-- Index for querying events by creator
CREATE INDEX idx_events_created_by ON events(created_by);

-- Constraint: extracted events must have a source, manual events must not
ALTER TABLE events
  DROP CONSTRAINT events_has_source;

ALTER TABLE events
  ADD CONSTRAINT events_source_constraint CHECK (
    (source_type = 'extracted' AND (message_id IS NOT NULL OR document_id IS NOT NULL))
    OR
    (source_type = 'manual' AND message_id IS NULL AND document_id IS NULL)
  );

-- Allow authenticated users to read all events (keep existing policy)
-- Allow users to insert their own manual events
CREATE POLICY "Users can create manual events"
  ON events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND source_type = 'manual'
    AND message_id IS NULL
    AND document_id IS NULL
  );

-- Allow users to update their own events
CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Allow users to delete their own events
CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (auth.uid() = created_by);

-- Drop old RLS policy that doesn't distinguish users (if it exists)
DROP POLICY IF EXISTS "Authenticated users can read events" ON events;

-- Add back READ policy for all authenticated users
CREATE POLICY "Authenticated users can read events"
  ON events FOR SELECT
  USING (auth.role() = 'authenticated');
