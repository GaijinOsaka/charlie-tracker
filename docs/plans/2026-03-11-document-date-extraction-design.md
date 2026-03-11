# Document Date Extraction & Direct Upload Design

**Date:** 2026-03-11
**Status:** Draft

## Problem

School documents (newsletters, letters, timetables) contain key dates buried in PDFs. Currently these can only be discovered by reading the documents manually. We need a way to extract dates from documents and add them to the calendar, just like messages are ingested for events today.

Additionally, there's no way to upload documents directly through the tracker UI — documents only arrive via email attachments or web scraping.

## Goals

1. Upload documents directly through the Document Browser
2. Extract text from any document via Docling (existing n8n pipeline)
3. Analyze extracted text with an LLM to identify key dates and events
4. Create calendar events linked back to the source document
5. Keep RAG indexing and date extraction as independent actions

## Schema Changes

### events table

Make `message_id` nullable and add `document_id` so events can come from either source:

```sql
ALTER TABLE events ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE events ADD COLUMN document_id UUID REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE events ADD CONSTRAINT events_has_source
  CHECK (message_id IS NOT NULL OR document_id IS NOT NULL);
```

### documents table

Add date extraction tracking fields (mirrors existing `indexed_for_rag` / `last_indexed_at` pattern):

```sql
ALTER TABLE documents ADD COLUMN dates_extracted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN dates_extracted_at TIMESTAMPTZ;
```

## New Edge Function: extract-dates

A new Supabase Edge Function that:

1. Receives `{ document_id }`
2. Fetches the document's `content_text` (errors if not yet extracted)
3. Sends text to OpenAI with a structured prompt:
   - "Extract all dates and events from this school document"
   - For each: title, date (ISO), time (if mentioned), description, action_required flag
   - Returns JSON array
4. Inserts each event into `events` table with `document_id` set
5. Updates `documents.dates_extracted = true, dates_extracted_at = now()`

**Dependency:** Requires `content_text` to be populated first (Docling extraction must run before date extraction).

## UI Changes

### Document Browser — Upload Button

- "Upload Document" button in the Document Browser header
- File picker accepts PDF, DOCX, images
- Uploads to `charlie-documents/uploads/{filename}` in Supabase Storage
- Creates a `documents` row with `source_type = 'upload'`
- Document appears in the grid immediately

### DocumentCard — Action Buttons

Three independent actions with state-dependent availability:

| Document State | Extract Text | RAG Index | Extract Dates |
|---|---|---|---|
| No `content_text` | **Enabled** | Disabled | Disabled |
| Has `content_text`, not processed | Done | **Enabled** | **Enabled** |
| Fully processed | Done | Remove from RAG | Re-extract dates |

### CalendarView — Document-Sourced Events

- Events from documents show a document icon instead of message icon
- Expandable panel shows document filename with download link
- Same layout pattern as existing message source panel

## Data Flow

```
                    +----------------+
                    |  Upload File   | (new)
                    +-------+--------+
                            |
                            v
+----------------+    +------------+
| Email attach   |--->| documents  |
| (auto-sync)    |    |   table    |
+----------------+    +------+-----+
                             |
                      +------v-------+
                      | Extract Text | (click)
                      | n8n > Docling|
                      +------+-------+
                             | content_text populated
                      +------+-------+
                      |              |
               +------v------+ +----v-----------+
               |  RAG Index  | | Extract Dates  |
               |  Edge Fn    | | Edge Fn (new)  |
               |  (existing) | | > OpenAI       |
               +------+------+ +----+-----------+
                      |              |
               +------v------+ +----v----+
               | doc_chunks  | | events  |
               | + embeddings| |  table  |
               +-------------+ +---------+
```

## Implementation Steps

1. **Schema migration** — nullable `message_id`, add `document_id` to events, add `dates_extracted` fields to documents
2. **New Edge Function** — `extract-dates` with OpenAI date extraction
3. **Document Browser** — add upload button (file to Storage + documents row)
4. **DocumentCard** — add "Extract Text" and "Extract Dates" buttons with state logic
5. **CalendarView** — support document-sourced events with document panel
