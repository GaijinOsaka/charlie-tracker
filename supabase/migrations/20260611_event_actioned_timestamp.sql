-- Give calendar events an actioned timestamp so they persist in the
-- "Recently Actioned" / Actions list after being marked actioned, instead of
-- silently dropping out when action_required flips to false.
--
-- Mirrors messages.actioned_at / messages.actioned_by. Semantics:
--   action required (pending) = action_required = true AND actioned_at IS NULL
--   actioned                  = actioned_at IS NOT NULL

ALTER TABLE events ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS actioned_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_events_actioned_at ON events(actioned_at DESC);
