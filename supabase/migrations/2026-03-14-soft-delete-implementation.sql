-- Soft Delete Implementation: add shared_with to messages and create message_deletions table

-- 1. Add shared_with column to messages table
ALTER TABLE messages ADD COLUMN shared_with UUID[] DEFAULT ARRAY[]::UUID[];

-- Populate existing messages with all authenticated users
-- This ensures existing messages are visible to both users
UPDATE messages SET shared_with = ARRAY(SELECT id FROM auth.users);

-- 2. Create message_deletions table
CREATE TABLE message_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

CREATE INDEX idx_message_deletions_user ON message_deletions(user_id);
CREATE INDEX idx_message_deletions_message ON message_deletions(message_id);

-- 3. Enable RLS on message_deletions
ALTER TABLE message_deletions ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policy for message_deletions
CREATE POLICY "users_can_manage_own_deletions" ON message_deletions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Add new RLS policy on messages to filter soft-deleted messages
-- This policy allows users to see messages they're shared with, except ones they've deleted
CREATE POLICY "users_see_non_deleted_messages" ON messages
  FOR SELECT
  USING (
    auth.uid() = ANY(shared_with)
    AND NOT EXISTS (
      SELECT 1 FROM message_deletions
      WHERE user_id = auth.uid() AND message_id = messages.id
    )
  );
