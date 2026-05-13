-- Make sync_attachment_to_document run as its owner (postgres) so the
-- internal INSERT into `documents` succeeds even when the caller is a
-- restricted role like `n8n_worker` (which has SELECT but no INSERT on documents).
--
-- Without SECURITY DEFINER, the trigger inherits the caller's role, and PostgREST
-- writes from n8n authenticate as `n8n_worker`, hitting 42501 on `documents`.
--
-- SET search_path is mandatory hardening for SECURITY DEFINER functions to
-- prevent search_path-based privilege escalation.

CREATE OR REPLACE FUNCTION public.sync_attachment_to_document()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO documents (filename, file_path, source_type, source_url, category, tags, file_size_bytes)
  VALUES (
    NEW.filename,
    NEW.file_path,
    'email_attachment',
    NULL,
    'other',
    ARRAY['email']::TEXT[],
    NEW.file_size
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
