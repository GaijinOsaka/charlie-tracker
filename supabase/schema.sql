-- Charlie Oakes Tracker - Database Schema
-- Run this in Supabase SQL Editor

-- 1. Create categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action status enum type
CREATE TYPE action_status_enum AS ENUM ('pending', 'actioned', 'action_required');

-- 2. Create messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT '',
  subject TEXT NOT NULL,
  content TEXT,
  sender_name TEXT,
  sender_email TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  actioned_at TIMESTAMPTZ,
  actioned_by UUID REFERENCES auth.users(id),
  action_note TEXT,
  action_status action_status_enum DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  indexed_for_rag BOOLEAN DEFAULT FALSE
);

-- 3. Create attachments table
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_action_status ON messages(action_status);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read attachments" ON attachments FOR SELECT
  USING (auth.role() = 'authenticated');

-- Trigger: auto-create document row when attachment is inserted.
-- SECURITY DEFINER so callers (e.g. the n8n_worker role) don't need INSERT on documents.
CREATE OR REPLACE FUNCTION sync_attachment_to_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

CREATE TRIGGER trg_sync_attachment_to_document
  AFTER INSERT ON attachments
  FOR EACH ROW
  EXECUTE FUNCTION sync_attachment_to_document();

-- 4. Create sync_log table
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_started_at TIMESTAMPTZ NOT NULL,
  sync_completed_at TIMESTAMPTZ,
  messages_found INTEGER DEFAULT 0,
  messages_new INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create events table (key dates extracted from messages or documents)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME,
  event_end_time TIME,
  title TEXT NOT NULL,
  description TEXT,
  action_required BOOLEAN DEFAULT FALSE,
  action_detail TEXT,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT events_has_source CHECK (message_id IS NOT NULL OR document_id IS NOT NULL)
);

-- 6. Create indexes for performance
CREATE INDEX idx_messages_source_message_id ON messages(source_message_id);
CREATE INDEX idx_messages_category_id ON messages(category_id);
CREATE INDEX idx_messages_received_at ON messages(received_at DESC);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_sync_log_created_at ON sync_log(created_at DESC);
CREATE INDEX idx_events_message_id ON events(message_id);
CREATE INDEX idx_events_document_id ON events(document_id);
CREATE INDEX idx_events_event_date ON events(event_date);

-- 6. Seed categories with default values
INSERT INTO categories (name, color, keywords) VALUES
  ('Academic', '#3B82F6', ARRAY['homework', 'assignment', 'test', 'exam', 'grade', 'progress', 'report', 'results']),
  ('Events', '#10B981', ARRAY['trip', 'event', 'sports day', 'parents evening', 'concert', 'assembly', 'excursion', 'outing']),
  ('Health', '#EF4444', ARRAY['medical', 'illness', 'injury', 'nurse', 'first aid', 'hospital', 'doctor', 'health', 'wellbeing']),
  ('Admin', '#F59E0B', ARRAY['uniform', 'payment', 'consent', 'permission', 'form', 'document', 'fee', 'administration']),
  ('Pastoral', '#8B5CF6', ARRAY['behaviour', 'wellbeing', 'pastoral', 'safeguarding', 'conduct', 'discipline', 'support']),
  ('General', '#6B7280', ARRAY[]);

-- 7. Create updated_at trigger for messages
CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_updated_at_trigger
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_messages_updated_at();

-- 8. Enable Row Level Security (RLS) for security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies (authenticated users can read; service_role for writes)
CREATE POLICY "Authenticated users can read messages"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update messages"
  ON messages FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read attachments"
  ON attachments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read categories"
  ON categories FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read sync_log"
  ON sync_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read non-archived events"
  ON events FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND NOT EXISTS (
      SELECT 1 FROM event_archives
      WHERE user_id = auth.uid() AND event_id = events.id
    )
  );

-- 10. Create storage bucket
-- charlie-documents: all documents (web scraped PDFs under web_scrape/, email attachments under email/)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('charlie-documents', 'charlie-documents', false);

-- 11. Enable pgvector for RAG search
CREATE EXTENSION IF NOT EXISTS vector;

-- 12. Web pages table (scraped school website content)
CREATE TABLE web_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  content TEXT,
  content_hash TEXT,
  embedding vector(1536),
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Documents table (PDFs from web scraping and email attachments)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_text TEXT,
  embedding vector(1536),
  source_type TEXT DEFAULT 'web_scrape',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  category TEXT DEFAULT 'other',
  indexed_for_rag BOOLEAN DEFAULT FALSE,
  last_indexed_at TIMESTAMPTZ,
  dates_extracted BOOLEAN DEFAULT FALSE,
  dates_extracted_at TIMESTAMPTZ,
  file_size_bytes INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Document chunks table (selective RAG embeddings)
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  char_start INTEGER,
  char_end INTEGER,
  page_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_document_chunk UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_web_pages_url ON web_pages(url);
CREATE INDEX idx_documents_source_url ON documents(source_url);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_indexed_for_rag ON documents(indexed_for_rag);
CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE web_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read web_pages" ON web_pages FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read documents" ON documents FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read chunks" ON document_chunks FOR SELECT
  USING (auth.role() = 'authenticated');

-- 15. RAG search function (only searches indexed documents)
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  access_level text DEFAULT 'private'
)
RETURNS TABLE (
  chunk_id uuid, document_id uuid, content text,
  similarity float, document_name text, page_number integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT dc.id, dc.document_id, dc.content,
    (1 - (dc.embedding <=> query_embedding))::float, d.filename, dc.page_number
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  LEFT JOIN shareable_content sc
    ON sc.content_type = 'document'
    AND sc.content_id = d.id
    AND sc.is_shareable = true
  WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
  AND d.indexed_for_rag = true
  AND CASE
    WHEN access_level = 'public' THEN
      EXISTS (
        SELECT 1 FROM shareable_content
        WHERE content_type = 'document'
        AND content_id = d.id
        AND is_shareable = true
      )
    ELSE
      true
  END
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- 16. Profiles table (auto-created on sign-up)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 17. Per-user read status table (replaces messages.is_read)
CREATE TABLE message_read_status (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX idx_read_status_user ON message_read_status(user_id);
CREATE INDEX idx_read_status_message ON message_read_status(message_id);

ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own read status"
  ON message_read_status FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 18. User notifications table
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

-- Trigger: create notification for other user when message is actioned
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
        actor_name || ' actioned ''' || LEFT(NEW.subject, 60) || ''''
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_action_notification
  AFTER UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION create_action_notification();

-- 19. Per-user event archival (not global archived flag)
-- Users can archive events from their view without affecting other users
CREATE TABLE event_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  archived_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX idx_event_archives_user ON event_archives(user_id);
CREATE INDEX idx_event_archives_event ON event_archives(event_id);

-- Enable RLS on event_archives
ALTER TABLE event_archives ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only manage their own event archives
CREATE POLICY "users_can_manage_own_event_archives" ON event_archives
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy to events to allow users to manage their own archives (via the new table)
CREATE POLICY "Authenticated users can update events"
  ON events FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 20. Push subscriptions table (for web push notifications)
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL, -- Web push subscription object with endpoint, keys, and auth
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subscription)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own subscriptions"
  ON push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_subscriptions_updated_at_trigger
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscriptions_updated_at();

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions(user_id);

-- 21. Message status change trigger for action-required notifications
-- Calls notify-action-required Edge Function when message status changes to 'action_required'
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

DROP TRIGGER IF EXISTS message_status_change_notify ON messages;
CREATE TRIGGER message_status_change_notify
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_action_required();

-- 22. New message notification trigger
-- Create notification entry and send push notification when a message is received
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

CREATE TRIGGER message_creation_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();

-- Trigger to call Edge Function for push notification on new message
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

CREATE TRIGGER message_push_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_new_message();

-- 23. Notes table (shared scratchpad for both parents)
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_author ON notes(author_id);
CREATE INDEX idx_notes_event ON notes(event_id);
CREATE INDEX idx_notes_created ON notes(created_at DESC);

-- Back-reference on events: which note (if any) spawned this event
ALTER TABLE events ADD COLUMN note_id UUID REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX idx_events_note ON events(note_id);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all notes"
  ON notes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);

CREATE POLICY "Authenticated users can update any note"
  ON notes FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete any note"
  ON notes FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at_trigger
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();

-- 24. Event tags (free-form labels applied to events for filtering)
CREATE TABLE event_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE (event_id, tag)
);

ALTER TABLE event_tags ENABLE ROW LEVEL SECURITY;

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

