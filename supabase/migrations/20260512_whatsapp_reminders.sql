-- WhatsApp event reminders + weekly digest
-- See openspec/changes/add-whatsapp-reminders/ for full design and spec.

-- 1. Per-event reminder preference (default opt-in: 'none')
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reminder TEXT NOT NULL DEFAULT 'none'
    CHECK (reminder IN ('none', 'day_before', 'morning_of', 'both'));

-- 2. Per-user WhatsApp settings.
--    Lives in its own table (not on profiles) because the profiles SELECT policy
--    permits cross-user reads for display-name resolution, and phone numbers
--    must stay private to their owner.
CREATE TABLE IF NOT EXISTS user_whatsapp_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_phone TEXT,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own whatsapp settings"
  ON user_whatsapp_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own whatsapp settings"
  ON user_whatsapp_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own whatsapp settings"
  ON user_whatsapp_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own whatsapp settings"
  ON user_whatsapp_settings FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Per-(event, user, kind) dedup ledger for event reminders.
CREATE TABLE IF NOT EXISTS event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('day_before', 'morning_of')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  twilio_sid TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT,
  UNIQUE (event_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id ON event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent_at ON event_reminders(sent_at DESC);

ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read the ledger (useful for in-app history surfaces).
-- Writes happen only via service-role keys (n8n / Edge Functions); no client INSERT/UPDATE policy.
CREATE POLICY "Authenticated read event_reminders"
  ON event_reminders FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. Per-(user, week_start_date) dedup ledger for the Sunday weekly digest.
CREATE TABLE IF NOT EXISTS weekly_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  twilio_sid TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_digest_log_user_id ON weekly_digest_log(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_digest_log_week_start_date ON weekly_digest_log(week_start_date DESC);

ALTER TABLE weekly_digest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read weekly_digest_log"
  ON weekly_digest_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. Keep updated_at fresh on user_whatsapp_settings.
CREATE OR REPLACE FUNCTION touch_user_whatsapp_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_whatsapp_settings_set_updated_at ON user_whatsapp_settings;
CREATE TRIGGER user_whatsapp_settings_set_updated_at
  BEFORE UPDATE ON user_whatsapp_settings
  FOR EACH ROW
  EXECUTE FUNCTION touch_user_whatsapp_settings_updated_at();
