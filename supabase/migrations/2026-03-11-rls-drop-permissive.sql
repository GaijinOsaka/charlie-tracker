-- Drop all remaining permissive RLS policies that use USING (true)

-- document_chunks
DROP POLICY "Allow all read chunks" ON document_chunks;

-- documents
DROP POLICY "Allow all read documents" ON documents;
DROP POLICY "Allow all update documents" ON documents;
DROP POLICY "Allow all delete documents" ON documents;

-- events
DROP POLICY "Allow all delete events" ON events;
DROP POLICY "Allow all update events" ON events;
DROP POLICY "Allow all read events" ON events;

-- messages
DROP POLICY "Allow all delete messages" ON messages;
DROP POLICY "Allow all update messages" ON messages;

-- web_pages
DROP POLICY "Allow all read web_pages" ON web_pages;
