# Document Date Extraction & Direct Upload - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable documents to be uploaded directly, text-extracted via Docling, and analyzed by an LLM for key dates that get added to the calendar.

**Architecture:** Extend the existing Edge Function pattern. New `extract-dates` Edge Function calls OpenAI to find dates in `content_text`. Schema changes make `events.message_id` nullable and add `document_id`. Upload button in DocumentBrowser stores files in Supabase Storage and creates document rows.

**Tech Stack:** Supabase Edge Functions (Deno), OpenAI API, React, Supabase Storage

---

### Task 1: Schema Migration — Events table changes

**Files:**

- Create: `supabase/migrations/2026-03-11-document-date-extraction.sql`
- Modify: `supabase/schema.sql` (update reference schema to match)

**Step 1: Write the migration SQL**

Create `supabase/migrations/2026-03-11-document-date-extraction.sql`:

```sql
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

-- 6. RLS policy for events INSERT (needed for edge function)
CREATE POLICY "Allow all insert events" ON events FOR INSERT WITH CHECK (true);

-- 7. RLS policy for events UPDATE (needed for archive)
CREATE POLICY "Allow all update events" ON events FOR UPDATE USING (true);

-- 8. RLS policy for documents UPDATE (needed for edge function to set flags)
CREATE POLICY "Allow all update documents" ON documents FOR UPDATE USING (true);

-- 9. RLS policy for documents INSERT (needed for direct upload)
CREATE POLICY "Allow all insert documents" ON documents FOR INSERT WITH CHECK (true);

-- 10. RLS policy for documents DELETE (needed for delete button)
CREATE POLICY "Allow all delete documents" ON documents FOR DELETE USING (true);
```

**Step 2: Apply migration via Supabase MCP**

Run the migration SQL against the live database using the Supabase `execute_sql` or `apply_migration` MCP tool. The schema.sql file is a reference — the live DB is the source of truth.

**Step 3: Update schema.sql reference**

Update `supabase/schema.sql` to reflect the new state:

- Change `message_id UUID NOT NULL` to `message_id UUID` on the events table
- Add `document_id UUID REFERENCES documents(id) ON DELETE CASCADE` to events
- Add the CHECK constraint
- Add `dates_extracted` and `dates_extracted_at` columns to documents table
- Add the new indexes and RLS policies

**Step 4: Commit**

```bash
git add supabase/migrations/2026-03-11-document-date-extraction.sql supabase/schema.sql
git commit -m "feat: schema migration for document date extraction and direct upload"
```

---

### Task 2: Create `extract-dates` Edge Function

**Files:**

- Create: `supabase/functions/extract-dates/index.ts`

**Step 1: Create the edge function**

Create `supabase/functions/extract-dates/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch document
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, filename, content_text")
      .eq("id", document_id)
      .single();

    if (fetchErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!doc.content_text || doc.content_text.trim().length < 20) {
      return new Response(
        JSON.stringify({
          error: "Document has no extracted text. Run text extraction first.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get today's date for context
    const today = new Date().toISOString().split("T")[0];

    // Call OpenAI to extract dates
    const prompt = `You are analyzing a school document for key dates and events. Today's date is ${today}.

Extract ALL dates and events mentioned in this document. For each event, return:
- title: A short, clear title for the event
- event_date: The date in ISO format (YYYY-MM-DD). If only a day name is given (e.g. "Monday"), infer the most likely upcoming date.
- event_time: The time in HH:MM format if mentioned, or null
- description: A brief description with any relevant details
- action_required: true if parents/guardians need to do something (e.g. return a form, make a payment, attend a meeting, give consent)
- action_detail: If action_required is true, briefly describe what action is needed (e.g. "Return consent form by 15th March")

Return a JSON array of events. If no dates are found, return an empty array [].
Only return the JSON array, no other text.

Document filename: ${doc.filename}

Document content:
${doc.content_text.slice(0, 30000)}`;

    const openaiResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!openaiResp.ok) {
      const err = await openaiResp.text();
      throw new Error(`OpenAI API error: ${openaiResp.status} ${err}`);
    }

    const completion = await openaiResp.json();
    const rawContent = completion.choices[0].message.content;

    let events: any[];
    try {
      const parsed = JSON.parse(rawContent);
      // Handle both { events: [...] } and direct array
      events = Array.isArray(parsed) ? parsed : parsed.events || [];
    } catch {
      throw new Error("Failed to parse OpenAI response as JSON");
    }

    if (events.length === 0) {
      // Mark as extracted even if no dates found
      await supabase
        .from("documents")
        .update({
          dates_extracted: true,
          dates_extracted_at: new Date().toISOString(),
        })
        .eq("id", document_id);

      return new Response(
        JSON.stringify({
          success: true,
          events_created: 0,
          message: "No dates found in document.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Delete any existing events for this document (in case of re-extraction)
    await supabase.from("events").delete().eq("document_id", document_id);

    // Insert events
    const rows = events
      .filter((e: any) => e.title && e.event_date)
      .map((e: any) => ({
        document_id,
        event_date: e.event_date,
        event_time: e.event_time || null,
        title: e.title,
        description: e.description || null,
        action_required: e.action_required || false,
      }));

    const { error: insertErr } = await supabase.from("events").insert(rows);

    if (insertErr) {
      throw new Error(`Failed to insert events: ${insertErr.message}`);
    }

    // Update document flags
    await supabase
      .from("documents")
      .update({
        dates_extracted: true,
        dates_extracted_at: new Date().toISOString(),
      })
      .eq("id", document_id);

    return new Response(
      JSON.stringify({ success: true, events_created: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Deploy the edge function**

Deploy using Supabase MCP `deploy_edge_function` tool.

**Step 3: Commit**

```bash
git add supabase/functions/extract-dates/index.ts
git commit -m "feat: add extract-dates edge function for LLM date extraction"
```

---

### Task 3: Add Upload Button to DocumentBrowser

**Files:**

- Modify: `src/components/DocumentBrowser.jsx`

**Step 1: Add upload state and handler**

Add to DocumentBrowser component:

- `uploading` state (boolean)
- Hidden file input ref
- `handleUpload` function that:
  1. Takes the selected file
  2. Uploads to `charlie-documents/uploads/{timestamp}_{filename}` via `supabase.storage`
  3. Inserts a `documents` row with `source_type: 'upload'`, `filename`, `file_path`
  4. Calls `loadDocuments()` to refresh the grid

**Step 2: Add upload button to the UI**

Place an "Upload Document" button next to the filters or in the batch bar area. Style it with the existing `btn-doc` pattern.

**Step 3: Commit**

```bash
git add src/components/DocumentBrowser.jsx
git commit -m "feat: add direct document upload to DocumentBrowser"
```

---

### Task 4: Add Extract Text & Extract Dates Buttons to DocumentCard

**Files:**

- Modify: `src/components/DocumentCard.jsx`
- Modify: `src/components/DocumentBrowser.jsx` (pass `content_text` and `dates_extracted` to cards)

**Step 1: Update DocumentBrowser query to include new fields**

In `loadDocuments()`, add `content_text, dates_extracted` to the select query. We only need to know if `content_text` exists (not the full text), so we'll check `content_text IS NOT NULL` client-side.

Change the select to:

```javascript
.select('id, filename, file_path, source_url, source_type, tags, category, indexed_for_rag, content_text, dates_extracted, created_at')
```

**Step 2: Add Extract Text button to DocumentCard**

Add a button that:

- Shows "Extract Text" when `content_text` is null/empty
- Triggers n8n webhook (same as existing RAG flow when no text exists)
- Shows "Text Extracted" (disabled) when content_text exists
- The existing "Add to RAG" button remains but is disabled when no content_text

**Step 3: Add Extract Dates button to DocumentCard**

Add a button that:

- Shows "Extract Dates" when `content_text` exists AND `dates_extracted` is false
- Disabled when no `content_text` (tooltip: "Extract text first")
- Calls `supabase.functions.invoke('extract-dates', { body: { document_id: doc.id } })`
- Shows "Dates Extracted" when `dates_extracted` is true
- Allow re-extraction (click "Dates Extracted" to re-run)

**Step 4: Add dates_extracted badge to DocumentCard meta row**

Next to the RAG badge, show a dates badge:

- "Dates Extracted" (green) when `dates_extracted` is true
- Nothing when false (the button handles it)

**Step 5: Commit**

```bash
git add src/components/DocumentCard.jsx src/components/DocumentBrowser.jsx
git commit -m "feat: add extract text and extract dates buttons to DocumentCard"
```

---

### Task 5: Update CalendarView and Events List to Support Document-Sourced Events

**Files:**

- Modify: `src/App.jsx`
- Modify: `src/components/CalendarView.jsx`

**Step 1: Update loadEvents query in App.jsx**

Change the events select to also fetch document info:

```javascript
.select('*, messages(id, subject, sender_name, sender_email, content, source, received_at, is_read, attachments(id, filename, file_path, mime_type, file_size)), documents(id, filename, file_path), event_tags(tag)')
```

**Step 2: Update CalendarView to show document source**

In `renderEventCard`, after the existing message source display:

- If `evt.documents` exists (and no `evt.messages`), show document icon + filename
- The expand hint should say "Show document" / "Hide document" instead of "Show message"
- The expanded panel shows document filename with a download link (using signed URL from Storage)

**Step 3: Update Events list in App.jsx**

In the events tab rendering (lines ~339-429):

- After the existing message panel, add document panel support
- If `evt.documents` exists, show "From: {document filename}" in event source
- Expanded view shows document filename + download link
- Change "Show message" hints to be conditional on source type

**Step 4: Commit**

```bash
git add src/App.jsx src/components/CalendarView.jsx
git commit -m "feat: support document-sourced events in calendar and events list"
```

---

### Task 6: Add CSS Styles for New UI Elements

**Files:**

- Modify: `src/App.css`

**Step 1: Add styles for upload button**

```css
.btn-upload {
  padding: 8px 16px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: white;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-upload:hover {
  background: #2563eb;
}

.btn-upload:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**Step 2: Add styles for new document card buttons**

```css
.btn-extract-text {
  color: #7c3aed;
  border-color: #7c3aed;
}

.btn-extract-text:hover {
  background: #f5f3ff;
}

.btn-extract-dates {
  color: #d97706;
  border-color: #d97706;
}

.btn-extract-dates:hover {
  background: #fffbeb;
}

.doc-dates-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.doc-dates-badge.dates-yes {
  background: #fef3c7;
  color: #92400e;
}

.doc-text-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.doc-text-badge.text-yes {
  background: #ede9fe;
  color: #5b21b6;
}
```

**Step 3: Add styles for document source panel in events**

```css
.event-document-source {
  font-size: 11px;
  color: #7c3aed;
}

.event-doc-panel {
  border-top: 1px solid var(--border);
  padding: 16px;
  background: #f8fafc;
  border-radius: 0 0 8px 8px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.event-doc-icon {
  font-size: 24px;
}

.event-doc-info {
  flex: 1;
}

.event-doc-filename {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.btn-doc-download {
  padding: 6px 12px;
  border: 1px solid var(--primary);
  background: white;
  color: var(--primary);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-doc-download:hover {
  background: #eff6ff;
}
```

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: add CSS styles for document upload, extraction, and event display"
```

---

### Task 7: Final Integration Test

**Step 1: Start dev server and verify**

```bash
npm run dev
```

**Step 2: Manual test checklist**

- [ ] Document Browser shows upload button
- [ ] Can upload a PDF — appears in grid with source_type 'upload'
- [ ] "Extract Text" button visible on documents without content_text
- [ ] "Extract Dates" button disabled until text is extracted
- [ ] "Add to RAG" button disabled until text is extracted
- [ ] After text extraction, "Extract Dates" and "Add to RAG" become enabled
- [ ] Clicking "Extract Dates" calls edge function and creates events
- [ ] Events tab shows document-sourced events with document icon/filename
- [ ] Calendar shows document-sourced events
- [ ] Expanding a document-sourced event shows document info + download link
- [ ] Archiving a document-sourced event works

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: document date extraction and direct upload complete"
```
