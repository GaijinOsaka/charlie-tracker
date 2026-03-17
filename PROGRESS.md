# Project Progress Log

## Overall Status (Updated 2026-03-08)

| Component                      | Status       | Notes                                                               |
| ------------------------------ | ------------ | ------------------------------------------------------------------- |
| Supabase schema                | DONE         | Deployed with `source_message_id`, `source`, `events` table         |
| n8n self-hosted                | DONE         | Running on DO droplet (144.126.200.83)                              |
| Skyvern server                 | DONE         | Docker on bfc-docling-serve (139.59.165.79)                         |
| DO networking/firewall         | DONE         | VPC private network + cloud firewall                                |
| Gmail Monitor workflow         | DONE         | Working end-to-end, Arbor link detection fixed                      |
| Arbor Skyvern Scraper workflow | DONE         | Standalone workflow (y6vFVjpnwzr4qGMo)                              |
| Attachment handling            | DONE         | Gmail attachments → Supabase Storage + attachments table            |
| React dashboard                | DONE (basic) | Realtime, notifications, filtering, mark-as-read                    |
| Website scraping & RAG         | IN PROGRESS  | 23 pages scraped, 52 PDFs uploaded, Docling text extraction pending |
| Document management UI         | DONE         | Browse, tag, filter, download, selective RAG indexing               |
| React deployment               | NOT STARTED  | Need to deploy to Vercel                                            |
| Event/date extraction          | NOT STARTED  | Extract key dates from messages → events table                      |

---

## Session 1: Initial Planning & Setup (2026-02-21)

### What We Did

- Verified n8n MCP is working and available
- Confirmed tech stack: n8n + Supabase + React
- Defined MVP scope: Arbor scraping → Supabase → React dashboard
- Created initial project structure
- Created comprehensive design document and implementation plan

---

## Session 2: Design & Planning (2026-02-21)

### What We Did

- Presented 3 architectural approaches, chose Realtime-First
- Expanded MVP scope to include Gmail from day 1
- Created 15-task implementation plan
- Plan file: `docs/plans/2026-02-21-charlie-tracker-mvp.md`

---

## Session 3: React Dashboard (2026-02-27)

### What We Did

- Built React dashboard with Supabase realtime subscriptions
- Added toast notifications for new messages
- Added filtering by category, search, and date range
- Added mark-as-read functionality

### Files Created

- `src/App.jsx` - Main dashboard component
- `src/index.jsx` - Entry point
- `src/lib/supabase.js` - Supabase client config

---

## Session 4: Skyvern Integration (2026-02-26)

### What We Did

- Installed Skyvern as Docker containers on bfc-docling-serve droplet
- Configured DO VPC private networking between n8n and Skyvern droplets
- Set up DO Cloud Firewall restricting Skyvern API to n8n private IP only
- Built standalone Arbor Skyvern Scraper workflow (y6vFVjpnwzr4qGMo)
- Tested Skyvern against Arbor successfully
- Created Skyvern workflow in Skyvern UI (wpid_501572503217945790)

### Docs Created

- `docs/plans/2026-02-26-skyvern-integration-design.md`
- `docs/plans/2026-02-26-skyvern-n8n-implementation.md`
- `docs/skyvern-server-guide.md`

---

## Session 5: Gmail Monitor Workflow (2026-03-04)

### What We Did

- Designed Gmail Monitor workflow (`docs/plans/2026-03-04-gmail-workflow-design.md`)
- Built Charlie Tracker - Gmail Monitor workflow (gBJb0RH6dfvpLi21) with 25 nodes
- Updated Supabase schema: `arbor_message_id` → `source_message_id`, added `source` column, added `events` table
- Solved n8n sandbox limitations:
  - `process.env` not available → replaced with Set Credentials node
  - `$helpers.httpRequest()` not available → replaced with HTTP Request nodes
  - `fetch()` not available → replaced with Supabase nodes for category lookup
- Fixed multiple workflow routing bugs (Skip or Process?, Has Arbor Link?, Poll Skyvern loop)
- Removed stale pinned data from Poll Skyvern node that was blocking real API calls

### Current Workflow Structure (gBJb0RH6dfvpLi21)

```
Gmail Trigger / Manual Test → Test Emails
  → Process One at a Time
    → Prepare Email Data (parse Gmail fields, detect Arbor links, categorise)
    → Check Duplicate (Supabase lookup)
    → Is New? (dedup check)
    → Skip or Process? (isNew = true → process, false → skip)
      → Set Credentials (Skyvern/Supabase keys via Set node)
      → Has Arbor Link?
        → TRUE: Start Skyvern Task → Wait 30s → Poll Skyvern → Skyvern Done?
            → Done: Extract Arbor Content → Resolve Category → Lookup Category → Merge Category → Insert Message
            → Failed: Format Arbor Failure → Resolve Category → ...
            → Still running: Poll Wait 20s → Poll Skyvern (loop)
        → FALSE: Format Plain Email → Resolve Category → Lookup Category → Merge Category → Insert Message
  → Log Sync (on batch complete)
```

### Known Issues Fixed

| Issue                                       | Root Cause                                                   | Fix                              |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `process is not defined`                    | n8n Code sandbox blocks `process.env`                        | Set Credentials node             |
| `$helpers is not defined`                   | Task runner sandbox blocks `$helpers`                        | HTTP Request nodes               |
| `fetch is not defined`                      | Task runner sandbox blocks `fetch()`                         | Supabase nodes                   |
| Poll Skyvern always returns `outputs: null` | Stale pinned test data on node                               | Removed pinned data              |
| Poll loop bypassed                          | Poll Skyvern → Extract Arbor Content (skipped Skyvern Done?) | Fixed connection routing         |
| Non-arbor emails skipped                    | Skip or Process? checked `hasArborLink` not `isNew`          | Fixed condition to check `isNew` |
| Wrong workflow modified                     | Accidentally edited Arbor Skyvern Scraper                    | Restored from version history    |

---

## Session 6: Website Scraping & RAG (2026-03-08)

### What We Did

- Enabled pgvector extension in Supabase
- Created `web_pages` and `documents` tables with vector(1536) embedding columns
- Created `charlie-documents` Storage bucket for scraped PDFs
- Built Python scraping script (`scripts/scrape_website.py`) using BeautifulSoup + OpenAI embeddings
- Scraped 23 school website pages (3 targets + 20 parent hub sub-pages)
- Uploaded 52 PDFs to Supabase Storage
- Generated embeddings for all page content via OpenAI text-embedding-3-small
- Skipped Docling PDF text extraction (port 5000 firewalled from local machine)

### Files Created

- `scripts/scrape_website.py` - Main scraping & RAG ingestion script
- `scripts/requirements.txt` - Python dependencies
- `scripts/.env.example` - Environment template
- `scripts/.env` - Credentials (gitignored)

### Issues Resolved

| Issue                                                                 | Fix                                         |
| --------------------------------------------------------------------- | ------------------------------------------- |
| `supabase` Python SDK failed to install (heavy deps)                  | Used direct REST API with `requests`        |
| Git bash path conversion (`/term-dates` → `C:/Program Files/Git/...`) | `MSYS_NO_PATHCONV=1`                        |
| Supabase Storage 400 (file exists)                                    | Added `x-upsert: true` header               |
| Supabase REST 409 (duplicate URL)                                     | Added `?on_conflict=url` to upsert endpoint |

### Remaining

- Run Docling PDF text extraction from server (or open firewall port)
- Generate embeddings for extracted PDF text

---

## Session 7: Document Management & Selective RAG (2026-03-08)

### What We Did

- Added `document_chunks` table with vector(1536) embeddings for selective RAG
- Added columns to `documents` table: `tags`, `category`, `indexed_for_rag`, `last_indexed_at`, `file_size_bytes`, `description`
- Created `search_knowledge_base()` SQL function (cosine similarity, only indexed docs)
- Built auto-tagging script using Claude Haiku — tagged all 52 documents with categories and thematic tags
- Built RAG indexing CLI (`scripts/index_document.py`) — index, remove, reindex, batch, list
- Built Document Browser UI with tab navigation (Messages | Documents)
- Document cards show filename, category badge, RAG status, tags, with Download/Add to RAG/Edit Tags
- Filters: category, tag, RAG status, search
- Fixed RLS policies for anon key access
- Fixed Vite index.html location (must be at project root)
- Verified all 52 documents render correctly in browser

### Files Created/Modified

- `supabase/schema.sql` — altered documents, added document_chunks, search function
- `scripts/tag_documents.py` — auto-tag with Claude Haiku
- `scripts/index_document.py` — RAG indexing CLI
- `scripts/requirements.txt` — added anthropic
- `src/components/DocumentBrowser.jsx` — document grid with filters
- `src/components/DocumentCard.jsx` — document card component
- `src/components/TagEditor.jsx` — inline tag editor
- `src/App.jsx` — tab navigation (Messages | Documents)
- `src/App.css` — document browser styles
- `.env.local` — Vite env vars for Supabase
- `index.html` — moved to project root for Vite

### Remaining

- Extract PDF text via Docling (blocked — port firewalled from local)
- Run `index_document.py --batch` to index selected documents for RAG
- Test download signed URLs
- Deploy to Vercel

---

## What Still Needs Work

### ~~Priority 1: Test Gmail Monitor End-to-End~~ DONE

- [x] End-to-end test completed and working

### ~~Priority 1: Email Source Filtering~~ DONE

- [x] Add whitelisting for specific email addresses (jwramage1, harvey@kidzpod, chris.turner50, bjrobbo10)
- [x] Capture messages that mention "table tennis" regardless of sender domain (keyword matching)
- [x] Gmail Trigger query: `from:(@school OR addr1 OR addr2...) OR "table tennis"`

### ~~Priority 2: Attachment Handling~~ DONE

- [x] Add Gmail attachment extraction (Get Attachments node)
- [x] Upload to Supabase Storage bucket (`charlie-attachments`)
- [x] Insert rows into `attachments` table
- [x] Retested after `message_id` fix — working
- [ ] Handle Arbor attached documents (PDFs, letters) via Skyvern (future)

### Priority 3: Website Scraping & RAG Ingestion — IN PROGRESS

- [x] Database migrations: pgvector extension, `web_pages` table, `documents` table, indexes, RLS
- [x] Created `charlie-documents` Supabase Storage bucket
- [x] Python scraping script (`scripts/scrape_website.py`) with CLI flags (--dry-run, --page, --no-docling)
- [x] Scraped all 3 target pages + 20 sub-pages from `/topic/parents` hub (23 total)
- [x] Extracted page text content → `web_pages` table with OpenAI embeddings (text-embedding-3-small)
- [x] Downloaded 52 PDFs → Supabase Storage (`charlie-documents` bucket)
- [x] Inserted 52 document records into `documents` table
- [ ] Extract PDF text via Docling (firewalled from local — need to run from server or open port)
- [ ] Generate embeddings for PDF text content (blocked on Docling extraction)
- [ ] Optional: n8n scheduled workflow to periodically re-check for page updates

### Priority 4: Event/Date Extraction

- [ ] Build date extraction node (regex or LLM-powered)
- [ ] Parse dates like "15th March", "22/03/2026", "next Friday" from message content
- [ ] Insert into `events` table linked to message
- [ ] Add calendar view to React dashboard

### Priority 5: Deploy React Dashboard

- [ ] Deploy to Vercel
- [ ] Configure environment variables (Supabase URL, anon key)
- [ ] Test realtime subscriptions in production

### Priority 6: Vector Search & Smart Tagging

- [ ] Enable vector storage for messages (Supabase pgvector or external)
- [ ] Generate embeddings for message content on insert (via n8n or edge function)
- [ ] Add semantic search to React dashboard (search by meaning, not just keywords)
- [ ] Auto-tag uploaded documents (PDFs, attachments) with extracted keywords/topics
- [ ] Make attachments searchable via their tags and content summaries

### Priority 7: Polish & Monitoring

- [ ] Set up error alerting (n8n error workflow → notification)
- [ ] Monitor resource usage on both droplets
- [ ] Add more sender domains to Gmail whitelist (sports clubs etc)
- [ ] Consider LLM-powered auto-categorisation
- [ ] Gmail push notifications (webhook) instead of polling

---

## Infrastructure Reference

| Resource               | Details                                              |
| ---------------------- | ---------------------------------------------------- |
| n8n droplet            | 144.126.200.83 (1GB, LON1), SSH: `do-n8n`            |
| Skyvern droplet        | 139.59.165.79 (4GB, LON1), SSH: `do-skyvern-docling` |
| Private IPs            | n8n: 10.106.0.3, Skyvern: 10.106.0.5                 |
| Supabase project       | knqhcipfgypzfszrwrsu (`Charlie_Tracker`)             |
| Gmail Monitor workflow | gBJb0RH6dfvpLi21                                     |
| Arbor Skyvern Scraper  | y6vFVjpnwzr4qGMo                                     |
| Skyvern workflow ID    | wpid_501572503217945790                              |
