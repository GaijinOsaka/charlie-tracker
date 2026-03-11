-- 1. Per-user read status table
CREATE TABLE message_read_status (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX idx_read_status_user ON message_read_status(user_id);
CREATE INDEX idx_read_status_message ON message_read_status(message_id);

ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own read status"
  ON message_read_status FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Drop old is_read column from messages
ALTER TABLE messages DROP COLUMN IF EXISTS is_read;

-- 3. Change actioned_by from TEXT to UUID, add action_note
ALTER TABLE messages DROP COLUMN IF EXISTS actioned_by;
ALTER TABLE messages ADD COLUMN actioned_by UUID REFERENCES auth.users(id);
ALTER TABLE messages ADD COLUMN action_note TEXT;
