-- Add RAG status tracking to documents table
ALTER TABLE documents
ADD COLUMN rag_status TEXT DEFAULT 'idle' CHECK (rag_status IN ('idle', 'indexing', 'extracting', 'indexed', 'failed')),
ADD COLUMN rag_error TEXT,
ADD COLUMN last_rag_attempt TIMESTAMP;

-- Create index for status queries
CREATE INDEX idx_documents_rag_status ON documents(rag_status) WHERE rag_status != 'idle';
