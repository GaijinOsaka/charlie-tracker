-- Add 'action_required' value to action_status_enum
ALTER TYPE action_status_enum ADD VALUE 'action_required';

-- Create function to notify when message status changes to action_required
CREATE OR REPLACE FUNCTION trigger_notify_action_required()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if status changed TO "action_required"
  IF NEW.action_status = 'action_required' AND OLD.action_status IS DISTINCT FROM NEW.action_status THEN
    -- Call the Edge Function via http_request (Supabase provides this)
    PERFORM
      net.http_post(
        url := 'https://' || current_setting('app.settings.supabase_url') || '/functions/v1/notify-action-required',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'id', NEW.id,
          'status', NEW.action_status,
          'subject', NEW.subject,
          'content', NEW.content,
          'sender_name', NEW.sender_name,
          'old_status', OLD.action_status
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for message status changes
DROP TRIGGER IF EXISTS message_status_change_notify ON messages;
CREATE TRIGGER message_status_change_notify
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_action_required();
