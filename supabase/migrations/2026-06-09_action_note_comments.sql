-- Allow a neutral 'comment' entry on action_notes so chain replies can be
-- posted without changing the message's action status.
-- Existing 'action_required' / 'actioned' rows are unaffected.

ALTER TABLE action_notes
  DROP CONSTRAINT IF EXISTS action_notes_action_type_check;

ALTER TABLE action_notes
  ADD CONSTRAINT action_notes_action_type_check
  CHECK (action_type = ANY (ARRAY['action_required'::text, 'actioned'::text, 'comment'::text]));
