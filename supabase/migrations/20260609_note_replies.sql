-- Inline replies on shared notes
-- Mirrors the action_notes pattern: short append-only comments attached to a parent record.

CREATE TABLE note_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_note_replies_note ON note_replies(note_id, created_at);

ALTER TABLE note_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all replies"
  ON note_replies FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert own replies"
  ON note_replies FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);

CREATE POLICY "Authenticated users can delete own replies"
  ON note_replies FOR DELETE
  USING (auth.role() = 'authenticated' AND auth.uid() = author_id);
