-- Shared Notes feature
-- Creates notes table and links it bidirectionally to events

-- 1. Create notes table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_author ON notes(author_id);
CREATE INDEX idx_notes_event ON notes(event_id);
CREATE INDEX idx_notes_created ON notes(created_at DESC);

-- 2. Back-reference on events: which note (if any) spawned this event
ALTER TABLE events ADD COLUMN note_id UUID REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX idx_events_note ON events(note_id);

-- 3. RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all notes"
  ON notes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);

CREATE POLICY "Authenticated users can update any note"
  ON notes FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete any note"
  ON notes FOR DELETE
  USING (auth.role() = 'authenticated');

-- 4. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at_trigger
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();
