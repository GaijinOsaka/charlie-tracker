-- Add trigger for new message notifications
-- When a new message is created, notify all users and send push notification

CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Notify all authenticated users about the new message
  -- (max 2 users in the system, both should know about incoming messages)
  FOR user_record IN
    SELECT id FROM profiles
  LOOP
    INSERT INTO user_notifications (user_id, message_id, type, summary)
    VALUES (
      user_record.id,
      NEW.id,
      'new_message',
      COALESCE(NEW.sender_name, NEW.source) || ': ' || LEFT(NEW.subject, 60)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on INSERT for messages table
DROP TRIGGER IF EXISTS message_creation_notification ON messages;
CREATE TRIGGER message_creation_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();

-- Add trigger to call Edge Function for push notification
CREATE OR REPLACE FUNCTION trigger_notify_new_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function to send push notifications
  PERFORM
    net.http_post(
      url := 'https://' || current_setting('app.settings.supabase_url') || '/functions/v1/notify-new-message',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'id', NEW.id,
        'subject', NEW.subject,
        'content', NEW.content,
        'sender_name', NEW.sender_name,
        'source', NEW.source
      )
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create second trigger for push notifications
DROP TRIGGER IF EXISTS message_push_notification ON messages;
CREATE TRIGGER message_push_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_new_message();
