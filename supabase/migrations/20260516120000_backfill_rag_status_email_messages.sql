-- Backfill rag_status for synthetic email_message documents created by
-- the index-message Edge Function prior to the fix that started writing
-- rag_status. Without this, the Documents page renders "🔒 Not Indexed"
-- for messages that are in fact indexed (indexed_for_rag = true,
-- chunks present in document_chunks).

UPDATE documents
SET rag_status = 'indexed'
WHERE indexed_for_rag = true
  AND source_type = 'email_message'
  AND (rag_status IS NULL OR rag_status = 'idle');
