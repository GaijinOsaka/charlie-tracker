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
  source_message_id TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT '',
  subject TEXT NOT NULL,
  content TEXT,
  sender_name TEXT,
  sender_email TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  actioned_at TIMESTAMPTZ,
  actioned_by TEXT,
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

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all read attachments" ON attachments FOR SELECT USING (true);

-- Trigger: auto-create document row when attachment is inserted
CREATE OR REPLACE FUNCTION sync_attachment_to_document()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

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

CREATE POLICY "Allow authenticated users to read events"
  ON events FOR SELECT
  USING (auth.role() = 'authenticated');

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
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE web_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read web_pages" ON web_pages FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read documents" ON documents FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read chunks" ON document_chunks FOR SELECT
  USING (auth.role() = 'authenticated');

-- 15. RAG search function (only searches indexed documents)
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
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
  WHERE (1 - (dc.embedding <=> query_embedding)) > match_threshold
  AND d.indexed_for_rag = true
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
