-- Drop old permissive policies and replace with auth-scoped ones

-- Messages: authenticated read, authenticated update (for actioning), authenticated insert
DROP POLICY IF EXISTS "Allow authenticated users to read messages" ON messages;
DROP POLICY IF EXISTS "Allow all read messages" ON messages;
CREATE POLICY "Authenticated read messages" ON messages FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update messages" ON messages FOR UPDATE
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert messages" ON messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Attachments
DROP POLICY IF EXISTS "Allow authenticated users to read attachments" ON attachments;
DROP POLICY IF EXISTS "Allow all read attachments" ON attachments;
CREATE POLICY "Authenticated read attachments" ON attachments FOR SELECT
  USING (auth.role() = 'authenticated');

-- Categories
DROP POLICY IF EXISTS "Allow authenticated users to read categories" ON categories;
CREATE POLICY "Authenticated read categories" ON categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- sync_log
DROP POLICY IF EXISTS "Allow authenticated users to read sync_log" ON sync_log;
CREATE POLICY "Authenticated read sync_log" ON sync_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Events
DROP POLICY IF EXISTS "Allow authenticated users to read events" ON events;
CREATE POLICY "Authenticated read events" ON events FOR SELECT
  USING (auth.role() = 'authenticated');

-- Web pages
DROP POLICY IF EXISTS "Allow authenticated read web_pages" ON web_pages;
CREATE POLICY "Authenticated read web_pages" ON web_pages FOR SELECT
  USING (auth.role() = 'authenticated');

-- Documents
DROP POLICY IF EXISTS "Allow authenticated read documents" ON documents;
CREATE POLICY "Authenticated read documents" ON documents FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update documents" ON documents FOR UPDATE
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert documents" ON documents FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Document chunks
DROP POLICY IF EXISTS "Allow authenticated read chunks" ON document_chunks;
CREATE POLICY "Authenticated read chunks" ON document_chunks FOR SELECT
  USING (auth.role() = 'authenticated');
