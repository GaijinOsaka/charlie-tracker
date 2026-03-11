-- 1. Notifications table
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'actioned',
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_undismissed
  ON user_notifications(user_id) WHERE dismissed_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications"
  ON user_notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Trigger: create notification for other user when message is actioned
CREATE OR REPLACE FUNCTION create_action_notification()
RETURNS TRIGGER AS $$
DECLARE
  other_user_id UUID;
  actor_name TEXT;
BEGIN
  IF NEW.actioned_at IS NOT NULL AND (OLD.actioned_at IS NULL) THEN
    SELECT id INTO other_user_id FROM profiles WHERE id != NEW.actioned_by LIMIT 1;
    SELECT display_name INTO actor_name FROM profiles WHERE id = NEW.actioned_by;

    IF other_user_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, message_id, type, summary)
      VALUES (
        other_user_id,
        NEW.id,
        'actioned',
        actor_name || ' actioned ''' || LEFT(NEW.subject, 60) || '''' ||
          CASE WHEN NEW.action_note IS NOT NULL AND NEW.action_note != ''
            THEN E' \u2014 ' || LEFT(NEW.action_note, 200)
            ELSE '' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_action_notification
  AFTER UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION create_action_notification();
