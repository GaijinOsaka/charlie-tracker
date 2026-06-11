-- Give shared notes the same action-required workflow as messages and events.
-- Until now notes had no action concept at all (just title/body/note_replies).
--
-- Semantics (matches events):
--   action required (pending) = action_required = true AND actioned_at IS NULL
--   actioned                  = actioned_at IS NOT NULL
-- note_replies double as the conversation chain (no new table needed).

ALTER TABLE notes ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS actioned_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_notes_action_required ON notes(action_required) WHERE action_required = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_actioned_at ON notes(actioned_at DESC);
