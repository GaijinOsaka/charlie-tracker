# App Improvements Plan — May 2026

Improvement backlog identified via OpenSpec explore session (2026-05-07).
Update status here as items are completed; commit and push so all machines stay in sync.

## Completed This Session

| # | Item | Status |
|---|------|--------|
| – | n8n category tagging: fixed env var bug (`SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`) | ✅ Done |
| – | SQL backfill: categorised all 61 existing messages | ✅ Done |
| A | Category filter UI + colour badges on message rows | ✅ Done |
| B | Message load cap raised 100 → 500; stale-while-revalidate (5 min threshold) | ✅ Done |
| – | PWA close/reopen bug: Workbox `networkTimeoutSeconds: 3` + first-load retry after 4s | ✅ Done |

---

## Backlog

### Tier 1 — Quick wins (< 1 day each)

**C — action_notes realtime subscription**
- Currently action notes added by the other user don't appear until manual refresh
- Add a Supabase Realtime subscription on the `action_notes` table alongside the existing `messages` subscription
- On insert: patch the message in local state by appending the new note to `msg.action_notes`

**D — ICS calendar export**
- Add an "Export" button to the calendar/events view
- Generate a `.ics` file client-side from the `events` array
- Trigger a download; no backend needed
- Libraries: `ical-generator` (npm) or hand-roll the RFC 5545 format (events are simple enough)

**E — "Summarise" document button**
- Add a Summarise button to `DocumentCard`
- On click: call the `rag-chat` Edge Function with a fixed prompt like "Summarise this document in 3 bullet points" and the document's filename as context
- Display the result in a small modal or inline below the card

---

### Tier 2 — Medium effort (1–3 days each)

**F — Semantic search toggle**
- Add a toggle in the messages search bar: "Keyword / Semantic"
- Semantic mode calls `rag-chat` with the query and displays ranked message results by embedding similarity
- Requires the messages to already be indexed for RAG (most are via the n8n workflow)

**G — "This week" digest view**
- A new tab/section showing: events in the next 7 days + action_required messages flagged in the last 7 days
- Meant as a quick daily briefing view
- No new data fetching needed — derives from existing `events` and `messages` state

---

### Tier 3 — Larger features (3+ days each)

**H — RSVP / response tracking on events**
- Add `rsvp_status` column to `events` table (values: `pending`, `yes`, `no`, `maybe`)
- UI: RSVP buttons on event cards
- Nice-to-have: RSVP reminder push notification for events with action_required

**I — WhatsApp group/sender grouping**
- Group WhatsApp messages by sender or group chat name in the messages list
- Requires a `group_name` or `chat_name` field to be populated by the WhatsApp ingestion pipeline
- UI: collapsible sender groups similar to the ActionsBox sections

**J — Context-aware RAG chat**
- When a specific message or document is open, pre-load it as context into the `rag-chat` Edge Function
- "Ask about this message" button on message expand → opens ChatDrawer with the message pre-loaded
- Requires passing `messageId` or `documentId` to the Edge Function and retrieving its embedding neighbours

---

## Notes

- All items are frontend-only unless noted; no new DB migrations required for A–G
- The `rag-chat` Edge Function is already deployed and handles semantic search + Claude responses
- Push this file after each work session so progress is visible on all machines
