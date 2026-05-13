-- Enable RLS on event_tags with authenticated read+write policies.
--
-- Closes the Supabase advisory that flagged event_tags as RLS-disabled.
-- Policy mirrors the rest of the app: any authenticated user in this
-- 2-user household can read or write tags on any event. Tighter scoping
-- (e.g. event creator only) was considered and rejected — the cap of 2
-- users makes per-row ownership checks unnecessary.
--
-- Policies are created first so RLS can be enabled without locking the
-- app out between the two statements.

CREATE POLICY "Authenticated users can read event_tags"
  ON event_tags FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert event_tags"
  ON event_tags FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update event_tags"
  ON event_tags FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete event_tags"
  ON event_tags FOR DELETE
  USING (auth.role() = 'authenticated');

ALTER TABLE event_tags ENABLE ROW LEVEL SECURITY;
