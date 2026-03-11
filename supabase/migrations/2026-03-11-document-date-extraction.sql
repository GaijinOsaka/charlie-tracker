-- Migration: Document Date Extraction & Direct Upload
-- Applied: 2026-03-11

-- 1. Make message_id nullable on events
ALTER TABLE events ALTER COLUMN message_id DROP NOT NULL;

-- 2. Add document_id column
ALTER TABLE events ADD COLUMN document_id UUID REFERENCES documents(id) ON DELETE CASCADE;

-- 3. Ensure every event has at least one source
ALTER TABLE events ADD CONSTRAINT events_has_source
  CHECK (message_id IS NOT NULL OR document_id IS NOT NULL);

-- 4. Index for document-linked events
CREATE INDEX idx_events_document_id ON events(document_id);

-- 5. Add date extraction tracking to documents
ALTER TABLE documents ADD COLUMN dates_extracted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN dates_extracted_at TIMESTAMPTZ;

-- 6. RLS policy for documents INSERT (needed for direct upload)
CREATE POLICY "Allow all insert documents" ON documents FOR INSERT WITH CHECK (true);
