# Message RAG Indexing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Add to RAG" button to email messages that indexes both message content and attachments into the RAG knowledge base.

**Architecture:** New Edge Function `index-message` creates a synthetic `documents` row for the message text, chunks + embeds it directly, then fires existing `index-document` for each attachment. Everything uses the existing `documents`/`document_chunks`/`search_knowledge_base()` pipeline. UI adds a toggle button to the message actions bar.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), React (JSX), Supabase JS client, OpenAI embeddings API, PostgreSQL

**Design doc:** `docs/plans/2026-03-11-message-rag-design.md`

---

### Task 1: Add `indexed_for_rag` column to messages table

**Files:**
- Modify: `supabase/schema.sql` (add column to messages CREATE TABLE)

**Step 1: Run migration SQL on live database**

Run this in Supabase SQL Editor (or via MCP):

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS indexed_for_rag BOOLEAN DEFAULT FALSE;
```

**Step 2: Update schema.sql to match**

In `supabase/schema.sql`, add the column to the `messages` CREATE TABLE block, after `updated_at`:

```sql
  indexed_for_rag BOOLEAN DEFAULT FALSE,
```

This goes at line 28, before the closing `);` of the messages table.

**Step 3: Verify**

Run: `SELECT indexed_for_rag FROM messages LIMIT 1;` in SQL editor.
Expected: Returns `false`.

**Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add indexed_for_rag column to messages table"
```

---

### Task 2: Create `index-message` Edge Function

**Files:**
- Create: `supabase/functions/index-message/index.ts`

**Step 1: Create the Edge Function file**

Create `supabase/functions/index-message/index.ts` with the following code. This function reuses the same chunking and embedding logic as `index-document` (see `supabase/functions/index-document/index.ts` for reference).

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): { content: string; char_start: number; char_end: number }[] {
  const chunks: { content: string; char_start: number; char_end: number }[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    let chunk = text.slice(start, end);

    if (end < text.length) {
      const separators = [". ", ".\n", "\n\n", "\n", " "];
      for (const sep of separators) {
        const lastBreak = chunk.lastIndexOf(sep);
        if (lastBreak > chunkSize * 0.5) {
          end = start + lastBreak + sep.length;
          chunk = text.slice(start, end);
          break;
        }
      }
    }

    const trimmed = chunk.trim();
    if (trimmed.length > 20) {
      chunks.push({ content: trimmed, char_start: start, char_end: end });
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

async function generateEmbeddings(
  texts: string[],
  openaiKey: string
): Promise<number[][]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts.map((t) => t.slice(0, 32000)),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message_id, action } = await req.json();

    if (!message_id || !action) {
      return new Response(
        JSON.stringify({ error: "message_id and action required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "remove") {
      // 1. Find the synthetic document for this message
      const syntheticPath = `email_message/${message_id}`;
      const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("file_path", syntheticPath)
        .single();

      if (doc) {
        await supabase.from("document_chunks").delete().eq("document_id", doc.id);
        await supabase
          .from("documents")
          .update({ indexed_for_rag: false, last_indexed_at: null })
          .eq("id", doc.id);
      }

      // 2. Un-index attachment documents
      const { data: attachments } = await supabase
        .from("attachments")
        .select("file_path")
        .eq("message_id", message_id);

      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          const { data: attDoc } = await supabase
            .from("documents")
            .select("id")
            .eq("file_path", att.file_path)
            .single();

          if (attDoc) {
            await supabase.from("document_chunks").delete().eq("document_id", attDoc.id);
            await supabase
              .from("documents")
              .update({ indexed_for_rag: false, last_indexed_at: null })
              .eq("id", attDoc.id);
          }
        }
      }

      // 3. Update message flag
      await supabase
        .from("messages")
        .update({ indexed_for_rag: false })
        .eq("id", message_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "index") {
      if (!openaiKey) {
        return new Response(
          JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Fetch message
      const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .select("id, subject, content, sender_name, sender_email, received_at")
        .eq("id", message_id)
        .single();

      if (msgErr || !msg) {
        return new Response(
          JSON.stringify({ error: "Message not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!msg.content || msg.content.trim().length < 20) {
        return new Response(
          JSON.stringify({ error: "Message content too short to index" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Upsert synthetic document for message content
      const syntheticPath = `email_message/${message_id}`;
      const { data: existingDoc } = await supabase
        .from("documents")
        .select("id")
        .eq("file_path", syntheticPath)
        .single();

      let docId: string;

      if (existingDoc) {
        docId = existingDoc.id;
        await supabase
          .from("documents")
          .update({
            filename: msg.subject,
            content_text: msg.content,
            source_type: "email_message",
            tags: ["email", "message"],
          })
          .eq("id", docId);
      } else {
        const { data: newDoc, error: insertErr } = await supabase
          .from("documents")
          .insert({
            filename: msg.subject,
            file_path: syntheticPath,
            content_text: msg.content,
            source_type: "email_message",
            source_url: null,
            tags: ["email", "message"],
            category: "other",
          })
          .select("id")
          .single();

        if (insertErr || !newDoc) {
          return new Response(
            JSON.stringify({ error: `Failed to create document: ${insertErr?.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        docId = newDoc.id;
      }

      // 3. Delete existing chunks (re-index case)
      await supabase.from("document_chunks").delete().eq("document_id", docId);

      // 4. Chunk and embed message content
      const chunks = chunkText(msg.content);
      let totalCreated = 0;
      const batchSize = 20;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.content);
        const embeddings = await generateEmbeddings(texts, openaiKey);

        const rows = batch.map((chunk, idx) => ({
          document_id: docId,
          chunk_index: i + idx,
          content: chunk.content,
          embedding: JSON.stringify(embeddings[idx]),
          char_start: chunk.char_start,
          char_end: chunk.char_end,
        }));

        const { error: chunkErr } = await supabase
          .from("document_chunks")
          .insert(rows);

        if (chunkErr) {
          return new Response(
            JSON.stringify({ error: `Chunk insert failed: ${chunkErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        totalCreated += batch.length;
      }

      // 5. Mark document as indexed
      await supabase
        .from("documents")
        .update({
          indexed_for_rag: true,
          last_indexed_at: new Date().toISOString(),
        })
        .eq("id", docId);

      // 6. Fire index-document for each attachment (fire-and-forget)
      const { data: attachments } = await supabase
        .from("attachments")
        .select("file_path")
        .eq("message_id", message_id);

      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          // Find the documents row for this attachment
          const { data: attDoc } = await supabase
            .from("documents")
            .select("id")
            .eq("file_path", att.file_path)
            .single();

          if (attDoc) {
            const indexDocUrl = `${supabaseUrl}/functions/v1/index-document`;
            fetch(indexDocUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ doc_id: attDoc.id, action: "index" }),
            }).catch(() => {});
          }
        }
      }

      // 7. Update message flag
      await supabase
        .from("messages")
        .update({ indexed_for_rag: true })
        .eq("id", message_id);

      // 8. Fire extract-dates (fire-and-forget)
      const extractDatesUrl = `${supabaseUrl}/functions/v1/extract-dates`;
      fetch(extractDatesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ document_id: docId }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          chunks_created: totalCreated,
          attachments_triggered: attachments?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'index' or 'remove'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

**Step 2: Deploy the Edge Function**

```bash
cd "c:\Users\david\Charlie App\charlie-tracker"
npx supabase functions deploy index-message --no-verify-jwt
```

**Step 3: Verify deployment**

Test with curl (replace `YOUR_SUPABASE_URL` and `YOUR_ANON_KEY`):

```bash
curl -X POST https://YOUR_SUPABASE_URL/functions/v1/index-message \
  -H "Content-Type: application/json" \
  -d '{"message_id": "nonexistent", "action": "index"}'
```

Expected: `{"error":"Message not found"}` with status 404.

**Step 4: Commit**

```bash
git add supabase/functions/index-message/index.ts
git commit -m "feat: add index-message edge function for RAG indexing messages"
```

---

### Task 3: Add "Add to RAG" button to message UI

**Files:**
- Modify: `src/App.jsx:79-86` (add `indexed_for_rag` to messages select query)
- Modify: `src/App.jsx:592-611` (add RAG button to message actions)
- Modify: `src/App.css` (add button styles)

**Step 1: Update loadMessages query to include indexed_for_rag**

In `src/App.jsx`, find the `loadMessages` function (line ~82). Change the select to include `indexed_for_rag`:

```javascript
// Before:
.select('*, attachments(id, filename, file_path, mime_type, file_size)')

// After:
.select('*, indexed_for_rag, attachments(id, filename, file_path, mime_type, file_size)')
```

Note: `*` already includes all columns, but being explicit about `indexed_for_rag` makes intent clear. Actually `*` already covers it, so no change needed here. Just verify it's included.

**Step 2: Add indexing state and handler function**

In `src/App.jsx`, add a state variable for tracking which message is currently indexing. Add near the other useState declarations (around line 32):

```javascript
const [indexingMessages, setIndexingMessages] = useState(new Set())
```

Add the handler function after `actionMessage` (around line 210):

```javascript
async function toggleMessageRag(msg) {
  const action = msg.indexed_for_rag ? 'remove' : 'index'
  setIndexingMessages(prev => new Set(prev).add(msg.id))
  try {
    const { data, error } = await supabase.functions.invoke('index-message', {
      body: { message_id: msg.id, action },
    })

    if (error) {
      let errMsg = error.message
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json()
          errMsg = body.error || errMsg
        }
      } catch (_) {}
      throw new Error(errMsg)
    }

    if (data?.error) throw new Error(data.error)

    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, indexed_for_rag: action === 'index' } : m
    ))
    addToast(
      action === 'index'
        ? `Indexed message${data?.attachments_triggered ? ` + ${data.attachments_triggered} attachment(s)` : ''}`
        : 'Removed from RAG',
      'success'
    )
  } catch (err) {
    console.error('RAG toggle error:', err)
    addToast(`Failed to ${action} message: ${err.message}`, 'error')
  } finally {
    setIndexingMessages(prev => {
      const next = new Set(prev)
      next.delete(msg.id)
      return next
    })
  }
}
```

**Step 3: Add the button to message actions**

In `src/App.jsx`, find the message actions div (line ~592). Add the RAG button after the "Mark Actioned" button and before "Delete":

```jsx
<button
  className={`btn-rag-toggle ${msg.indexed_for_rag ? 'btn-rag-remove' : 'btn-rag-add'}`}
  onClick={() => toggleMessageRag(msg)}
  disabled={indexingMessages.has(msg.id)}
>
  {indexingMessages.has(msg.id)
    ? (msg.indexed_for_rag ? 'Removing...' : 'Indexing...')
    : (msg.indexed_for_rag ? 'Remove from RAG' : 'Add to RAG')}
</button>
```

**Step 4: Add an "Indexed" badge to message meta**

In `src/App.jsx`, find the message-meta div (line ~541). Add after the actioned badge:

```jsx
{msg.indexed_for_rag && <span className="indexed-badge">RAG Indexed</span>}
```

**Step 5: Add CSS styles**

In `src/App.css`, add these styles (at the end of the file or near the existing message action button styles):

```css
/* Message RAG button */
.btn-rag-toggle {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-rag-add {
  background: #dbeafe;
  color: #1e40af;
  border-color: #93c5fd;
}

.btn-rag-add:hover:not(:disabled) {
  background: #bfdbfe;
}

.btn-rag-remove {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}

.btn-rag-remove:hover:not(:disabled) {
  background: #fecaca;
}

.btn-rag-toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.indexed-badge {
  background: #dbeafe;
  color: #1e40af;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
```

**Step 6: Verify in browser**

1. Open the app, go to Messages tab
2. Find a message with content — should see "Add to RAG" button
3. Click it — should show "Indexing..." then switch to "Remove from RAG"
4. Check Documents tab — should see a new document with the message subject as filename
5. Try Ask Charlie — ask about the message content, should get a relevant answer

**Step 7: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: add RAG indexing toggle for email messages"
```

---

### Task 4: End-to-end verification

**Step 1: Test indexing a real message**

1. In the Messages tab, find the "Training Days and Summer Training Days" message from Jason Ramage
2. Click "Add to RAG"
3. Wait for it to complete (should show toast with chunks created + attachments triggered)

**Step 2: Verify in Documents tab**

1. Go to Documents tab
2. Should see a new document named "Training Days and Summer Training Days" with tags `email`, `message`
3. It should show "Indexed" badge

**Step 3: Verify in Ask Charlie**

1. Open the chat drawer
2. Ask: "What are the summer training days?"
3. Should get a response citing the message content

**Step 4: Test removal**

1. Go back to Messages tab
2. Click "Remove from RAG" on the same message
3. Verify the document in Documents tab is no longer indexed

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: any adjustments from e2e testing"
```
