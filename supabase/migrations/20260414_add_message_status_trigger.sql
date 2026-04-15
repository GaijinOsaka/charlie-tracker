-- Add 'action_required' value to action_status_enum
ALTER TYPE action_status_enum ADD VALUE 'action_required';

-- Create function to notify when message status changes to action_required
CREATE OR REPLACE FUNCTION trigger_notify_action_required()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT := 'https://knqhcipfgypzfszrwrsu.supabase.co';
  v_service_key TEXT;
BEGIN
  -- Only trigger if status changed TO "action_required"
  IF NEW.action_status = 'action_required' AND OLD.action_status IS DISTINCT FROM NEW.action_status THEN
    -- Try to get service key from Postgres settings (may not be available)
    v_service_key := current_setting('app.settings.supabase_service_key', true);

    -- Only call notification if we have the service key
    IF v_service_key IS NOT NULL AND v_service_key != '' THEN
      BEGIN
        PERFORM
          net.http_post(
            url := v_supabase_url || '/functions/v1/notify-action-required',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || v_service_key,
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
      EXCEPTION WHEN OTHERS THEN
        -- Log the error but don't block the update
        RAISE WARNING 'Failed to call notify-action-required: %', SQLERRM;
      END;
    END IF;
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
