-- Add action_status enum type
CREATE TYPE action_status_enum AS ENUM ('pending', 'actioned');

-- Add action_status column to messages table
ALTER TABLE messages ADD COLUMN action_status action_status_enum DEFAULT NULL;

-- Create indexes for filtering
CREATE INDEX idx_messages_action_status ON messages(action_status);

-- Backfill existing data: if actioned_at is set, mark as 'actioned'; otherwise null
UPDATE messages SET action_status = 'actioned' WHERE actioned_at IS NOT NULL;
