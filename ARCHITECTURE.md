# System Architecture Reference

**Quick navigation to understand how all pieces fit together**

---

## High-Level Flow

```
SOURCES           COLLECTION         STORAGE          PRESENTATION
═════════════════════════════════════════════════════════════════════

Arbor             n8n Scraper        Supabase         React
(School App)   →  (Playwright)    →  (PostgreSQL)  →  Dashboard
                                     (Realtime)       (WebSocket)

Gmail             n8n Scraper                        Toast
(Email)        →  (Gmail API)    ┐                   Alerts
                                 ├→ Deduplication ┐
WhatsApp       →  n8n Webhook    │                 ├→ REST API   → Messages
(Phase 2)        (Receiver)      │                 │             → Status
                                 └→ RLS            └→ Realtime
                                    Policies
```

---

## Component Ownership & Responsibilities

### n8n (Data Collection)

**Responsibility:** Extract messages from sources, normalize, deliver to Supabase

| Component             | What It Does                              | Runs Every  |
| --------------------- | ----------------------------------------- | ----------- |
| **Arbor Scraper**     | Browser automation → extract messages     | 15 min      |
| **Gmail Scraper**     | Query Gmail API → extract emails          | 15 min      |
| **WhatsApp Receiver** | Listen for webhooks → parse messages      | Real-time   |
| **Deduplication**     | Compare against Arbor to avoid duplicates | Per message |
| **Error Handler**     | Retry logic, log failures to sync_log     | Per error   |

### Supabase (Data Storage & Distribution)

**Responsibility:** Store normalized messages, provide APIs, broadcast changes

| Component        | What It Does                        | Access                    |
| ---------------- | ----------------------------------- | ------------------------- |
| **messages**     | Core message table (all sources)    | n8n (write), React (read) |
| **categories**   | Academic, Events, Health, etc.      | n8n (read), React (read)  |
| **attachments**  | File metadata for email/Arbor files | n8n (write), React (read) |
| **sync_log**     | History of scraping runs            | n8n (write), React (read) |
| **REST API**     | CRUD operations (HTTP)              | n8n & React               |
| **Realtime**     | WebSocket for instant updates       | React subscribers         |
| **RLS Policies** | Row-level security (auth checks)    | All queries               |

### React (Dashboard Frontend)

**Responsibility:** Display messages, receive alerts, allow user interactions

| Component               | What It Does                | Syncs With           |
| ----------------------- | --------------------------- | -------------------- |
| **MessageList**         | Display all messages        | Supabase (REST)      |
| **Realtime Subscriber** | Listen for new messages     | Supabase (WebSocket) |
| **Toast Notifier**      | Show alerts on new messages | Realtime Subscriber  |
| **Filter/Search**       | Client-side filtering       | MessageList          |
| **Mark as Read**        | Update is_read field        | Supabase (REST)      |

---

## Data Flow: New Arbor Message Example

```
Timeline: 15-minute sync interval

T=0s: Schedule trigger fires (cron: */15 * * * *)
  ↓
T=1s: Playwright opens browser
  ↓
T=5s: Logs into Arbor
  ↓
T=10s: Extracts message list HTML
  ↓
T=11s: Parses messages:
       - arbor_message_id: "msg_12345"
       - subject: "School Trip Reminder"
       - sender: "Mrs. Smith <smith@school.co.uk>"
       - received_at: "2026-02-21T10:30:00Z"
  ↓
T=12s: Checks Supabase: does msg_12345 exist?
       → No, it's new
  ↓
T=13s: Inserts to messages table:
       INSERT INTO messages (
         source='arbor',
         source_id='msg_12345',
         subject='School Trip Reminder',
         sender_name='Mrs. Smith',
         sender_email='smith@school.co.uk',
         received_at='2026-02-21T10:30:00Z',
         is_read=false
       )
  ↓
T=14s: Supabase fires INSERT trigger
  ↓
T=14.1s: Realtime broadcasts event to subscribed clients:
         {
           type: 'INSERT',
           new: { id: '...', subject: '...', ... }
         }
  ↓
T=14.2s: React receives event in useEffect
  ↓
T=14.3s: React updates state:
         - Prepends message to messages array
         - Increments unreadCount
         - Triggers toast notification
  ↓
T=14.4s: UI re-renders:
         - MessageList shows new message at top
         - Unread badge updates (🔔 3 → 🔔 4)
         - Toast shows: "New message from Mrs. Smith"
  ↓
T=15s: Toast auto-dismisses
```

### Same Message Via Gmail (Deduplication Flow)

```
T=15s: Gmail scraper runs (same 15-min interval)
  ↓
T=15.5s: Fetches Gmail: found "School Trip Reminder" email
         from smith@school.co.uk at 2026-02-21T10:30:00Z
  ↓
T=16s: Deduplication code runs:
       Query: SELECT id FROM messages
              WHERE source='arbor'
              AND sender_email='smith@school.co.uk'
              AND subject='School Trip Reminder'
       → MATCH FOUND (the Arbor message from 1 minute ago)
  ↓
T=16.1s: Decision: SKIP this email
  ↓
T=16.2s: Log to sync_log:
         messages_found=1, messages_new=0,
         note='1 email deduplicated'
  ↓
T=17s: User never sees the email (Arbor version already displayed)
```

---

## Database Schema Quick Reference

### messages (Primary Table)

```sql
messages {
  id: UUID PRIMARY KEY                    -- Unique message ID

  -- Source Information
  source: TEXT (arbor | gmail | whatsapp) -- Which app sent it
  source_id: TEXT UNIQUE                  -- ID from source system

  -- Content
  subject: TEXT NOT NULL                  -- Message title
  content: TEXT                           -- Full message body

  -- Sender Info
  sender_name: TEXT                       -- Person's name
  sender_email: TEXT                      -- Person's email

  -- Metadata
  received_at: TIMESTAMPTZ NOT NULL       -- When source received it
  category_id: UUID FK REFERENCES categories
  is_read: BOOLEAN DEFAULT false          -- Read status (for alerts)

  -- Timestamps
  created_at: TIMESTAMPTZ DEFAULT NOW()   -- When we stored it
  updated_at: TIMESTAMPTZ DEFAULT NOW()   -- Last changed
}

-- Indexes (for fast queries)
idx_messages_source                 -- Group by Arbor/Gmail/WhatsApp
idx_messages_received_at DESC       -- Sort by newest first
idx_messages_is_read                -- Filter unread
idx_messages_created_at DESC        -- Timeline view
```

### Other Tables

```sql
categories {
  id: UUID PRIMARY KEY
  name: TEXT UNIQUE              -- "Academic", "Health", etc.
  color: TEXT                    -- UI color: "#3B82F6"
  keywords: TEXT[]               -- Auto-categorization hints
}

attachments {
  id: UUID PRIMARY KEY
  message_id: UUID FK
  filename: TEXT
  file_path: TEXT                -- Path in Supabase Storage
  file_size: INTEGER
  mime_type: TEXT                -- image/png, application/pdf
}

sync_log {
  id: UUID PRIMARY KEY
  sync_started_at: TIMESTAMPTZ
  sync_completed_at: TIMESTAMPTZ
  messages_found: INTEGER        -- How many new in source
  messages_new: INTEGER          -- How many actually inserted
  status: TEXT                   -- success | failed | partial
  error_message: TEXT            -- If failed, why
}
```

---

## API Contracts

### n8n → Supabase

**Insert New Message (n8n does this)**

```bash
POST /rest/v1/messages
Authorization: Bearer SERVICE_ROLE_KEY

{
  "source": "arbor",
  "source_id": "msg_12345",
  "subject": "School Trip",
  "content": "Full message text...",
  "sender_name": "Mrs. Smith",
  "sender_email": "smith@school.co.uk",
  "received_at": "2026-02-21T10:30:00Z",
  "is_read": false
}
```

**Query Messages (n8n reads for deduplication)**

```bash
GET /rest/v1/messages?source=eq.arbor&sender_email=eq.smith@school.co.uk&subject=ilike.School%20Trip
Authorization: Bearer SERVICE_ROLE_KEY
```

### React → Supabase

**Fetch Messages (on page load)**

```bash
GET /rest/v1/messages?order=received_at.desc&limit=50
Authorization: Bearer ANON_KEY
```

**Mark as Read (user clicks)**

```bash
PATCH /rest/v1/messages?id=eq.UUID
Authorization: Bearer ANON_KEY

{ "is_read": true }
```

**Realtime Subscription (in React)**

```javascript
const subscription = supabase
  .from("messages")
  .on("INSERT", callback)
  .subscribe();
```

---

## Security & Access Control

### Authentication Levels

| Level            | Uses        | Access          | Scope               |
| ---------------- | ----------- | --------------- | ------------------- |
| **Service Role** | n8n         | Full read/write | All data            |
| **Anon Key**     | React       | Read-only, RLS  | Authenticated users |
| **User Auth**    | React login | Read-only, RLS  | User's data         |

### Row-Level Security (RLS)

```sql
-- Only authenticated users can read
CREATE POLICY "authenticated_read"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

-- n8n service role bypasses RLS (trusted agent)
-- Default: OFF for public queries
-- ON for user queries (if multi-user in future)
```

---

## Error Handling Flows

### n8n Scraper Failure

```
n8n Arbor Scraper runs
  ↓
Exception: Login failed (incorrect password)
  ↓
Error Handler Catches:
  - Logs to sync_log: status='failed', error_message='Login failed'
  - Retries 3x with exponential backoff (5s, 10s, 20s)
  ↓
Still failing after 3 attempts?
  - Alert user (TBD: email? Slack?)
  - Wait for next 15-min interval
  - Try again
  ↓
User checks sync_log for insights
```

### Supabase Connection Error

```
n8n tries to insert message
  ↓
Supabase API returns 500 (connection issue)
  ↓
Retry handler:
  - Wait 2s, retry
  - Wait 4s, retry
  - Wait 8s, retry
  ↓
Succeeds on 2nd/3rd retry (connection restored)
  - Message inserted
  - Continues processing
```

### React Realtime Disconnect

```
React: WebSocket connected to Supabase Realtime
  ↓
Network hiccup (user closes laptop, WiFi drops)
  ↓
WebSocket: Connection drops
  ↓
React: Auto-reconnect with backoff
  - Attempt 1: 1s
  - Attempt 2: 2s
  - Attempt 3: 5s
  - Attempt 4: 10s (max)
  ↓
User reopens laptop, WiFi returns
  ↓
React: Successfully reconnects
  ↓
React: Fetches latest messages (REST fallback)
  ↓
User sees all messages, back in sync
```

---

## Monitoring Checklist

**Daily:**

- [ ] Check sync_log: are both workflows running successfully?
- [ ] Verify React dashboard loads
- [ ] Test realtime (send test message, see alert within 1s)

**Weekly:**

- [ ] Check for patterns in errors
- [ ] Verify message count is growing normally
- [ ] Test Gmail deduplication (send email, check it's skipped)

**Monthly:**

- [ ] Review Supabase storage usage
- [ ] Check n8n execution history for trends
- [ ] Verify no orphaned/duplicate messages

---

## Deployment Checklist

- [ ] Supabase schema deployed
- [ ] n8n Arbor workflow imported & activated
- [ ] n8n Gmail workflow created & activated
- [ ] React app built & deployed
- [ ] Realtime subscription tested
- [ ] Toast notifications working
- [ ] Mark as read functionality tested
- [ ] End-to-end test (message through full pipeline)
- [ ] Monitor for 24 hours (no errors)
- [ ] Go live ✅
