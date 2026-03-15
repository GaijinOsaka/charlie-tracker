# Gmail Workflow Design

**Date:** 2026-03-04
**Status:** Implemented
**n8n Workflow ID:** gBJb0RH6dfvpLi21
**n8n Workflow Name:** Charlie Tracker - Gmail Monitor

---

## Overview

Poll Gmail for Charlie-related emails from whitelisted sender domains, extract content (using Skyvern for Arbor links), store attachments, extract key dates, and insert into Supabase.

## Flow

```
Schedule (every 15 min)
  → Gmail: fetch recent emails from whitelisted domains
  → For each email:
      → Dedup check (source_message_id exists in Supabase?)
      → If new:
          → Extract attachments → Supabase Storage + attachments table
          → Check body for Arbor link (https://login.arbor.sc/...)
          → IF Arbor link found:
              → Skyvern: navigate link, login, extract full message content
              → Insert to Supabase (source='arbor', content=Skyvern output)
          → ELSE (plain email):
              → Insert to Supabase (source='gmail', content=email body)
          → Extract key dates from content → events table
      → Update sync_log
```

## Sender Whitelist

Configurable as n8n environment variable `GMAIL_WHITELIST_DOMAINS`:

- `archbishopcranmer.notts.sch.uk` — school
- Additional sports club domains added as needed

Gmail query format: `from:(@domain1 OR @domain2) newer_than:1h`

## Deduplication

Uses `source_message_id` column with prefix: `gmail_{gmail_message_id}`.

- Plain emails: `source='gmail'`, `source_message_id='gmail_{id}'`
- Arbor-linked emails: `source='arbor'`, `source_message_id='gmail_{id}'`

The Gmail ID prefix prevents the standalone Arbor scraper from re-capturing the same content.

## n8n Workflow Nodes

### Node 1 — Schedule Trigger

- Every 15 minutes

### Node 2 — Gmail: Fetch Emails

- OAuth2 credential
- Query: `from:(@archbishopcranmer.notts.sch.uk OR @sportsclub.com) newer_than:1h`
- `newer_than:1h` keeps the window tight (dedup handles overlap)

### Node 3 — Loop: For Each Email

### Node 4 — Supabase: Dedup Check

- Query `messages` where `source_message_id = 'gmail_{email.id}'`
- If exists → skip

### Node 5 — Code: Extract Attachments

- For each email part where `disposition = 'attachment'`:
  - Get attachment via Gmail API
  - Store to Supabase Storage bucket (`charlie-attachments`)
  - Insert row into `attachments` table (filename, file_path, file_size, mime_type, message_id)

### Node 6 — Code: Check for Arbor Link

- Regex scan email body for `https://login.arbor.sc/` links
- Output: `hasArborLink` (boolean) + `arborUrl` (extracted URL)

### Node 7 — IF Branch

### Node 7a (Arbor link) — HTTP: Call Skyvern API

- POST to `http://10.106.0.5:8000/api/v1/run/tasks`
- Task: navigate `arborUrl`, login with credentials, extract message content
- Poll run status every 10 seconds (max 120s timeout)
- On success: use extracted text as content
- On failure: fall back to email body content

### Node 7b (Plain email) — Code: Format for Insert

- Map Gmail fields → Supabase columns
- `source = 'gmail'`, `source_message_id = 'gmail_{id}'`

### Node 7a-cont — Code: Format Skyvern Result

- `source = 'arbor'`, `source_message_id = 'gmail_{id}'`
- Content from Skyvern extraction

### Node 8 — Supabase: Insert Message

- Both branches merge here
- Insert into `messages` table

### Node 9 — Code: Extract Key Dates

- Regex pass over message content to find dates
- Patterns: "15th March", "22/03/2026", "next Friday", "Monday 3rd April"
- Insert into `events` table linked to the message

### Node 10 — Supabase: Update sync_log

## New Database Table: events

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_time TIME,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_message_id ON events(message_id);
CREATE INDEX idx_events_event_date ON events(event_date);
```

RLS policy: authenticated users can SELECT.

## Attachments

Uses existing `attachments` table and Supabase Storage bucket `charlie-attachments`.

Gmail provides attachment metadata in message parts. The workflow fetches attachment data via the Gmail API and uploads to storage.

## Error Handling

- **Gmail fetch fails:** log to sync_log with status `'failed'`, retry next cycle
- **Skyvern task fails/times out (120s):** insert email with email body as fallback content, flag in sync_log
- **Supabase insert fails (constraint):** skip, log error
- **Each email processed independently** — one failure doesn't block others

## Environment Variables

- `GMAIL_WHITELIST_DOMAINS` — comma-separated domain list
- Existing: `SKYVERN_HOST`, `SKYVERN_API_KEY`, `ARBOR_EMAIL`, `ARBOR_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

## Future Upgrades

- [ ] **LLM-powered date extraction** — replace regex with LLM call for smarter parsing of dates, times, and event context from message content
- [ ] **Calendar view** — React dashboard component showing extracted events
- [ ] **Gmail push notifications** — webhook instead of polling for near-instant capture
- [ ] **Auto-categorization via LLM** — assign category_id based on message content
