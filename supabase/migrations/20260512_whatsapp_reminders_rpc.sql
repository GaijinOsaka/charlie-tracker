-- RPC helpers consumed by the n8n WhatsApp reminder workflows.
-- See openspec/changes/add-whatsapp-reminders/ for design.

-- Candidate (event × user × kind) rows whose scheduled WhatsApp reminder time
-- falls in the supplied window and hasn't already been logged in event_reminders.
-- Caller (n8n via service role) passes [now, now + 15 min) on each tick.
CREATE OR REPLACE FUNCTION get_due_event_reminders(
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ
)
RETURNS TABLE (
  event_id UUID,
  user_id UUID,
  kind TEXT,
  scheduled_at TIMESTAMPTZ,
  title TEXT,
  event_date DATE,
  event_time TIME,
  description TEXT,
  whatsapp_phone TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      e.id AS event_id,
      uws.user_id,
      'day_before'::text AS kind,
      ((e.event_date - INTERVAL '1 day' + TIME '20:00') AT TIME ZONE 'Europe/London') AS scheduled_at,
      e.title,
      e.event_date,
      e.event_time,
      e.description,
      uws.whatsapp_phone
    FROM events e
    CROSS JOIN user_whatsapp_settings uws
    WHERE NOT e.archived
      AND e.reminder IN ('day_before', 'both')
      AND uws.whatsapp_enabled = true
      AND uws.whatsapp_phone IS NOT NULL
      AND e.event_date >= CURRENT_DATE

    UNION ALL

    SELECT
      e.id AS event_id,
      uws.user_id,
      'morning_of'::text AS kind,
      ((e.event_date + TIME '07:00') AT TIME ZONE 'Europe/London') AS scheduled_at,
      e.title,
      e.event_date,
      e.event_time,
      e.description,
      uws.whatsapp_phone
    FROM events e
    CROSS JOIN user_whatsapp_settings uws
    WHERE NOT e.archived
      AND e.reminder IN ('morning_of', 'both')
      AND uws.whatsapp_enabled = true
      AND uws.whatsapp_phone IS NOT NULL
      AND e.event_date >= CURRENT_DATE
  )
  SELECT c.*
  FROM candidates c
  WHERE c.scheduled_at >= window_start
    AND c.scheduled_at < window_end
    AND NOT EXISTS (
      SELECT 1 FROM event_reminders er
      WHERE er.event_id = c.event_id
        AND er.user_id = c.user_id
        AND er.kind = c.kind
    );
$$;

-- Enrolled users who should receive the Sunday digest, plus the upcoming
-- Monday-Sunday event list. Caller passes the upcoming Monday as week_start.
-- Returns one row per (user, event); n8n groups by user to build the message.
-- Users with no events in the window still appear (event_id NULL) so n8n can
-- log a 'skipped' row for them.
CREATE OR REPLACE FUNCTION get_due_weekly_digest(week_start DATE)
RETURNS TABLE (
  user_id UUID,
  whatsapp_phone TEXT,
  week_start_date DATE,
  event_id UUID,
  title TEXT,
  event_date DATE,
  event_time TIME,
  description TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    uws.user_id,
    uws.whatsapp_phone,
    week_start AS week_start_date,
    e.id AS event_id,
    e.title,
    e.event_date,
    e.event_time,
    e.description
  FROM user_whatsapp_settings uws
  LEFT JOIN events e
    ON NOT e.archived
   AND e.event_date >= week_start
   AND e.event_date < week_start + INTERVAL '7 days'
  WHERE uws.whatsapp_enabled = true
    AND uws.whatsapp_weekly_digest = true
    AND uws.whatsapp_phone IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM weekly_digest_log wdl
      WHERE wdl.user_id = uws.user_id
        AND wdl.week_start_date = week_start
    )
  ORDER BY uws.user_id, e.event_date NULLS LAST, e.event_time NULLS LAST;
$$;

-- Service role calls these. Anon/authenticated do not.
REVOKE EXECUTE ON FUNCTION get_due_event_reminders(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_due_weekly_digest(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_due_event_reminders(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION get_due_weekly_digest(DATE) TO service_role;
