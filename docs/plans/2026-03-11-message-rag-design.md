# Message RAG Indexing ("Add to RAG" for Messages) Design

**Goal:** Let users selectively index email messages (content + attachments) into the RAG knowledge base via an "Add to RAG" button on each message.

**Architecture:** New Edge Function `index-message` creates a synthetic document for the message text, chunks + embeds it directly, then triggers existing `index-document` for each attachment. Everything flows through the existing `documents`/`document_chunks`/`search_knowledge_base()` pipeline — no changes to the search layer.

---

## Data Changes

### `messages` table

- Add column: `indexed_for_rag BOOLEAN DEFAULT FALSE`

### Synthetic `documents` row (per indexed message)

- `source_type: 'email_message'`
- `filename: '{subject}'`
- `file_path: 'email_message/{message_id}'` (synthetic, no actual file)
- `content_text: '{message content}'`
- `tags: ['email', 'message']`
- `indexed_for_rag: true`

No changes to `document_chunks`, `search_knowledge_base()`, or `rag-chat`.

---

## Edge Function: `index-message`

- `verify_jwt: false` (matches other Edge Functions)
- Input: `{ message_id, action: 'index' | 'remove' }`

### Index flow

1. Fetch message (subject, content, id) + attachments
2. Upsert `documents` row for message content (keyed by `file_path = 'email_message/{message_id}'`)
3. Chunk message content text, generate embeddings, insert into `document_chunks`
4. Mark document `indexed_for_rag: true`
5. For each attachment: find its `documents` row (created by `sync_attachment_to_document` trigger), fire `index-document` for it (fire-and-forget — handles Docling extraction for PDFs)
6. Update `messages.indexed_for_rag = true`
7. Fire `extract-dates` for the message document (fire-and-forget)

### Remove flow

1. Find message's synthetic document by `file_path = 'email_message/{message_id}'`
2. Delete its chunks, set `indexed_for_rag: false`
3. For each attachment document: delete chunks, set `indexed_for_rag: false`
4. Update `messages.indexed_for_rag = false`

---

## UI Changes

### Message actions bar (App.jsx)

- New "Add to RAG" / "Remove from RAG" button alongside existing Mark Read, Mark Actioned, Delete
- Shows "Indexing..." while in progress
- Same toggle pattern as DocumentCard's RAG button
- Message needs `indexed_for_rag` field in the query select

### Documents tab

- Message-content documents appear normally (source_type `email_message`, tagged `email`, `message`)
- No filtering — consistent with other documents

---

## Secrets Required

- `OPENAI_API_KEY` (already configured)
- `N8N_RAG_WEBHOOK_URL` (already configured, used for attachment Docling extraction)
