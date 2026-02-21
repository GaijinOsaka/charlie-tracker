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

-- 2. Create messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arbor_message_id TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  content TEXT,
  sender_name TEXT,
  sender_email TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

-- 5. Create indexes for performance
CREATE INDEX idx_messages_arbor_id ON messages(arbor_message_id);
CREATE INDEX idx_messages_category_id ON messages(category_id);
CREATE INDEX idx_messages_received_at ON messages(received_at DESC);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_sync_log_created_at ON sync_log(created_at DESC);

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

-- 9. Create RLS policies (allow authenticated users to read all)
CREATE POLICY "Allow authenticated users to read messages"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read attachments"
  ON attachments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read categories"
  ON categories FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read sync_log"
  ON sync_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- 10. Create storage bucket for attachments (run this via dashboard Storage tab instead)
-- Or use: SELECT storage.create_bucket('charlie-attachments', public => false);
