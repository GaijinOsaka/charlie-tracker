-- Conversation chain on calendar events flagged action-required.
-- Mirrors action_notes (messages) so events get the same threaded replies.
-- The event's single action_detail field stays as the opening entry; new
-- replies stack here as proper author-tagged rows.

CREATE TABLE event_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'comment'
    CHECK (action_type = ANY (ARRAY['action_required'::text, 'actioned'::text, 'comment'::text])),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_notes_event ON event_notes(event_id, created_at);

ALTER TABLE event_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all event notes"
  ON event_notes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert own event notes"
  ON event_notes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete own event notes"
  ON event_notes FOR DELETE
  USING (auth.role() = 'authenticated' AND auth.uid() = user_id);
