-- WhatsApp Feature Tables
-- Task 1: Create tables for WhatsApp bot integration with role-based access control

-- 1. shareable_content table
-- Tracks which documents/events are available to parents via WhatsApp
CREATE TABLE shareable_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  is_shareable BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_content_type CHECK (content_type IN ('document', 'event', 'note')),
  UNIQUE(content_type, content_id)
);

-- Enable RLS
ALTER TABLE shareable_content ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only authenticated users can access shareable_content
CREATE POLICY "Authenticated users can read shareable_content" ON shareable_content
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert shareable_content" ON shareable_content
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update shareable_content" ON shareable_content
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX idx_shareable_content_type_id ON shareable_content(content_type, content_id);
CREATE INDEX idx_shareable_content_created_at ON shareable_content(created_at);
CREATE INDEX idx_shareable_content_public_documents
  ON shareable_content(content_id)
  WHERE content_type = 'document' AND is_shareable = true;

-- 2. whatsapp_users table
-- Access control for private WhatsApp number - no PII stored
CREATE TABLE whatsapp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_role CHECK (role IN ('parent', 'admin'))
);

-- Enable RLS
ALTER TABLE whatsapp_users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only authenticated users can access whatsapp_users
CREATE POLICY "Authenticated users can read whatsapp_users" ON whatsapp_users
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert whatsapp_users" ON whatsapp_users
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update whatsapp_users" ON whatsapp_users
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Index for performance
CREATE INDEX idx_whatsapp_users_phone_hash ON whatsapp_users(phone_number_hash);

-- 3. whatsapp_interactions table
-- Audit log for GDPR compliance - no PII stored directly
CREATE TABLE whatsapp_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_hash TEXT NOT NULL,
  access_level TEXT NOT NULL,
  query_text TEXT,
  response_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_access_level CHECK (access_level IN ('public', 'private'))
);

-- Enable RLS
ALTER TABLE whatsapp_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only authenticated users can access whatsapp_interactions
CREATE POLICY "Authenticated users can read whatsapp_interactions" ON whatsapp_interactions
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert whatsapp_interactions" ON whatsapp_interactions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX idx_whatsapp_interactions_phone_hash ON whatsapp_interactions(phone_number_hash);
CREATE INDEX idx_whatsapp_interactions_created_at ON whatsapp_interactions(created_at);

-- Trigger to auto-update updated_at on shareable_content
CREATE OR REPLACE FUNCTION update_shareable_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_shareable_content_updated_at
  BEFORE UPDATE ON shareable_content
  FOR EACH ROW
  EXECUTE FUNCTION update_shareable_content_updated_at();
