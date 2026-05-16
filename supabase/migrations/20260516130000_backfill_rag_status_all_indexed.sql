-- Broader backfill: any document with indexed_for_rag=true but rag_status
-- still NULL or 'idle' was indexed by a historical code path that didn't
-- write rag_status. The Documents page renders "Not Indexed" for these rows.
-- Confirmed safe: every affected row has chunks in document_chunks.
--
-- Supersedes 20260516120000_backfill_rag_status_email_messages.sql, which
-- only covered source_type = 'email_message'. This migration extends the
-- same fix to email_attachment rows (and any future source types).

UPDATE documents
SET rag_status = 'indexed'
WHERE indexed_for_rag = true
  AND (rag_status IS NULL OR rag_status = 'idle');
